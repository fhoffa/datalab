/*
 * Copyright 2015 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */

function get_cell_contents() {
  var cells = IPython.notebook.get_cells();
  var outputs = []
  for (var cellindex in cells) {
    var cell = cells[cellindex];
    if (cell.cell_type == 'code') {
      var cell_outputs = cell.output_area.outputs;
      var scrubbed = [];
      for (var outputindex in cell_outputs) {
        var output = cell_outputs[outputindex].data;
        var scrubbed_data = {};
        for (var mimetype in output) {
          data = output[mimetype];
          if (data != undefined) {
            data = data.
              // Scrub job IDs
              replace(/job_[A-Za-z0-9_\-]+/g, "job_").
              // and DOM ids
              replace(/\"[0-9][0-9]?_[0-9]+\"/g, "id").
              // Remove DOM element IDs in require
              replace(/\element\![0-9]_[0-9]+/g, "element!").
              // remove memory addresses
              replace(/ at 0x[0-9abcdef]+>/g, ">").
              // Remove query job metadata except # rows
              replace(/{"rows": \[.*\]}\);/gm, "ROWS);").
              replace(/<br \/>\(rows: ([0-9]+),[^<]*</g, "<br />(rows: $1)<");
            // We also want to scrub table cell contents inside tbody but not thead. That may be hard with 
            // regexp so split first.
            var start = data.indexOf('<tbody>');
            if (start >= 0) {
                data = data.substring(0, start) +
                    data.substring(start).replace(/<th>[^<]*<\/th>/g, "<TH>").replace(/<td>[^<]*<\/td>/g, "<TD>");
            }
            //console.log('Saved ' + mimetype + ': ' + data);
          }
          scrubbed_data[mimetype] = data;
        }
        scrubbed.push(scrubbed_data);
      }
      outputs.push({outputs: scrubbed, element: cell.output_area.element});
    } else {
      outputs.push({outputs: null});
    }
  }
  return outputs;
}

function validate(old_outputs, new_outputs) {
  var failed = false;
  console.log('Validating...');
  if (old_outputs.length != new_outputs.length) {
    console.log('FAIL: Old output had ' + old_outputs.length + ' entries but new output has ' + new_outputs.length + ' entries');
    failed = true;
  }
  for (var i in new_outputs) {
    var cellfailed = false;
    var old_output = old_outputs[i];
    var new_output = new_outputs[i];
    var element = new_output.element;
    //console.log('old_output.outputs=' + old_output.outputs + ', new_output.outputs=' + new_output.outputs + ', element=' + element);
    if (old_output.outputs == null) {
      if (new_output.outputs != null) {
        cellfailed = true;
      }
    } else if (new_output.outputs == null) {
      console.log('FAIL: Cell ' + i + ' now has no code output but did before');
      cellfailed = true;
    } else if (old_output.outputs.length != new_output.outputs.length) {
      console.log('FAIL: Cell ' + i + ' had ' + old_output.outputs.length + ' outputs but now has ' +
          new_output.outputs.length);
      cellfailed = true;
    }
    if (!cellfailed) {
      for (var j in new_output.outputs) {
        var old_set = old_output.outputs[j];
        var new_set = new_output.outputs[j];
        if (old_set.length != new_set.length) {
          cellfailed = true;
          break;
        }
        for (var mt in new_set) {
          if (new_set[mt] != old_set[mt]) {
            console.log('FAIL: Failed at ' + i + ': ' + mt + '\nExpected: ' + old_set[mt] + '\nbut got: ' +
                new_set[mt]);
            cellfailed = true;
            break;
          }
        }
        if (cellfailed) {
          break;
        }
      }
    }
    if (cellfailed) {
      failed = true;
    }
    if (new_output.element) {
      if (cellfailed) {
        new_output.element[0].style.backgroundColor="red";
      } else {
        new_output.element[0].style.backgroundColor="green";
      }
    }
  }
  if (failed) {
    alert('FAIL');
  } else {
    alert('PASS!');
  }
}

function checkIfDone(old_outputs) {
  if (IPython.notebook.kernel_busy) {
    console.log('Busy');
    setTimeout(function() {
      checkIfDone(old_outputs);
    }, 1000);
  } else {
    console.log('Finished execution');
    var new_outputs = get_cell_contents();
    validate(old_outputs, new_outputs);
  }
}

function runNotebook() {
  if (IPython.notebook.kernel && IPython.notebook.kernel.is_connected()) {
    var old_outputs = get_cell_contents();
    IPython.notebook.clear_all_output();
    console.log('Start execution');
    IPython.notebook.execute_all_cells();
    setTimeout(function() {
      checkIfDone(old_outputs);
    }, 1000);
  } else {
    setTimeout(function() {
      runNotebook();
    }, 1000);
  }
}

function testNotebook() {
  console.log('test_notebook');
  var pageClass = document.body.className;
  if (pageClass.indexOf('notebook_app') >= 0) {
    runNotebook();
  }
}

require(['base/js/namespace', 'base/js/events', 'base/js/dialog', 'base/js/utils', 'base/js/security'],
        testNotebook);

