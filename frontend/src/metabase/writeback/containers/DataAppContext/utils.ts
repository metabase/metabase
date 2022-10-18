import _ from "lodash";
import { getIn } from "icepick";
import { t } from "ttag";

import type { Dataset } from "metabase-types/types/Dataset";

import type {
  DataAppContextType,
  FormattedObjectDetail,
  ObjectDetailField,
} from "./DataAppContext";

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

const PARAMETER_ACCESSOR_REGEXP = /{{(.*?)}}/m;

function getTemplateParameterDisplayValue(
  templateParameter?: ObjectDetailField,
) {
  const isLoading = !templateParameter;
  if (isLoading) {
    return t`Loading…`;
  }
  const missingValue = templateParameter.value === null;
  return missingValue ? t`N/A` : String(templateParameter.value);
}

/**
 * Takes a string and replaces all instances of {{parameterName}} with the value of the parameter
 *
 * @example
 * Input: "### {{ data.user.name }} from {{ data.user.company }}"
 * Output: "### John from Metabase"
 *
 * @param text parameterized text
 * @param context data app context to use when resolving parameter values
 * @returns formatted text with parameters replaced with real values
 */
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
  const parameter: ObjectDetailField = getIn(context, path);
  formattedText = formattedText.replace(
    parameterAccessor,
    getTemplateParameterDisplayValue(parameter),
  );
  return formatDataAppString(formattedText, context);
}
