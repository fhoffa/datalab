# Copyright 2015 Google Inc. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
# in compliance with the License. You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software distributed under the License
# is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
# or implied. See the License for the specific language governing permissions and limitations under
# the License.

"""Google Cloud Platform library - BigQuery UDF Functionality."""

import json
import gcp.storage


class FunctionCall(object):
  """Represents a BigQuery UDF invocation.
  """

  def __init__(self, udf, sql):
    """Initializes a UDF object from its pieces.

    Args:
      udf: the UDF being called.
      sql: the SQL representation of this call.
    """
    self._udf = udf
    self._sql = sql

  @property
  def udf(self):
    """ Gets the UDF for this call. """
    return self._udf

  def _repr_sql_(self):
    """Returns a SQL representation of the UDF object.

    Returns:
      A SQL string that can be embedded in another SQL statement.
    """
    return self._sql


class FunctionEvaluation(object):

  def __init__(self, udf, data):
    self._udf = udf
    self._data = data

  @property
  def udf(self):
    """ Gets the UDF for this call. """
    return self._udf

  @property
  def data(self):
    return self._data


class UDF(object):
  """Represents a BigQuery UDF declaration.
  """

  @property
  def name(self):
    return self._name

  @property
  def implementation(self):
    return self._implementation

  @property
  def imports(self):
    return self._imports

  def __init__(self, inputs, outputs, name, implementation, support_code=None, imports=None):
    """Initializes a Function object from its pieces.

    Args:
      inputs: a list of string field names representing the schema of input.
      outputs: a list of name/type tuples representing the schema of the output.
      name: the name of the javascript function
      implementation: a javascript function implementing the logic.
      support_code: additional javascript code that the function can use.
      imports: a list of GCS URLs or files containing further support code.
    Raises:
      Exception if the name is invalid.
      """
    self._outputs = outputs
    self._name = name
    self._implementation = implementation
    self._support_code = support_code
    self._imports = imports
    self._code = UDF._build_js(inputs, outputs, name, implementation, support_code)

  def expand_imported_code(self):
    """ For testing, we need to pull in any code from GCS imports. """
    code = self._support_code if self._support_code else ''
    if self._imports:
      for url in self._imports:
        try:
          content = gcp.storage.Item.from_url(url).read_from()
          code += '\n'
          code += content
        except Exception as e:
          raise Exception('Could not read import %s' % url)
    return code

  def __call__(self, data):
    if issubclass(type(data), list):
      return FunctionEvaluation(self, data)
    else:
      return FunctionCall(self, UDF._build_sql(self.name, self._outputs, data))

  @staticmethod
  def _build_sql(name, outputs, data):
    """Creates a BigQuery SQL UDF query invocation object.

    Args:
      name: the name of the UDF function
      outputs: a list of (name, type) tuples representing the schema of output.
      data: the query or table over which the UDF operates.
    """
    return '(SELECT %s FROM %s(%s))' % (', '.join([f[0] for f in outputs]), name, data._repr_sql_())

  @staticmethod
  def _build_js(inputs, outputs, name, implementation, support_code):
    """Creates a BigQuery SQL UDF javascript object.

    Args:
      inputs: a list of (name, type) tuples representing the schema of input.
      outputs: a list of (name, type) tuples representing the schema of the output.
      name: the name of the function
      implementation: a javascript function defining the UDF logic.
      support_code: additional javascript code that the function can use.
    """
    # Construct a comma-separated list of input field names
    # For example, field1,field2,...
    input_fields = json.dumps([f[0] for f in inputs])

    # Construct a json representation of the output schema
    # For example, [{'name':'field1','type':'string'},...]
    output_fields = [{'name': f[0], 'type': f[1]} for f in outputs]
    output_fields = json.dumps(output_fields, sort_keys=True)

    # Build the JS from the individual bits with proper escaping of the implementation
    if support_code is None:
      support_code = ''
    return '%s\n%s=%s;\nbigquery.defineFunction(\'%s\', %s, %s, %s);' % \
           (support_code, name, implementation.replace('"', '\\"'), name,
            input_fields, output_fields, name)

  def _repr_code_(self):
    return self._code

  def __repr_js__(self):
    return self._implementation
