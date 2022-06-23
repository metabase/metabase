import _ from "lodash";
import { getIn } from "icepick";

import { Dataset } from "metabase-types/types/Dataset";

import { DataAppContextType, FormattedObjectDetail } from "./DataAppContext";

export function turnRawDataIntoObjectDetail({ data }: Dataset) {
  const objectDetail: FormattedObjectDetail = {};
  const { cols, rows } = data;
  const [row] = rows;

  if (!row) {
    return objectDetail;
  }

  cols.forEach((column, columnIndex) => {
    const formattedColumnName = _.camelCase(column.display_name);
    objectDetail[formattedColumnName] = {
      column,
      value: row[columnIndex],
    };
  });

  return objectDetail;
}

// Accessor string looks like "{{ data.user.name }}"
// Output looks like [ "data", "user", "name" ]
function getContextPath(accessorString: string) {
  const cleanPathString = accessorString
    .replaceAll("{", "")
    .replaceAll("}", "")
    .trim();
  return cleanPathString.split(".");
}

const PARAMETER_ACCESSOR_REGEXP = /{{(.*?)}}/gm;

// Example:
// Input: "### {{ data.user.name }} from {{ data.user.company }}"
// Output: "### John from Metabase"
export function formatDataAppString(
  text: string,
  context: DataAppContextType,
): string {
  const match = PARAMETER_ACCESSOR_REGEXP.exec(text);
  if (!match) {
    return text;
  }
  const [parameterAccessor] = match;
  let formattedText = text;
  const path = getContextPath(parameterAccessor);
  const parameter = getIn(context, path);
  if (parameter) {
    formattedText = formattedText.replace(parameterAccessor, parameter.value);
  }
  return formatDataAppString(formattedText, context);
}
