import _ from "underscore";

import { utf8_to_b64url } from "metabase/lib/encoding";

import type { AdhocQuestionData, QueryField } from "./types";
import { Tool } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/constants/agent-tools-spec";
import { getToolSpec } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/constants/agent-tools-spec";
import { RowValues } from "metabase-types/api";
import Field from "metabase-lib/v1/metadata/Field";

const getBody = ({
  content,
  tools,
}: {
  content: string;
  systemPrompt?: string;
  fields?: QueryField[];
  tools: Tool[];
}) => {
  const body = JSON.stringify({
    // model: "meta.llama3-1-8b-instruct-v1:0",
    // model: "meta.llama3-1-70b-instruct-v1:0",
    // model: "mistral.mixtral-8x7b-instruct-v0:1",
    // model: "mistral.mistral-large-2402-v1:0",
    // model: "gpt-4o-2024-08-06",
    messages: [{ content, role: "user" }],
    // fields: JSON.stringify(fields),
    tools,
  });
  return body;
};

export const adhockifyURL = (
  urlData: Record<string, any> & { display: string },
  vizType?: string,
) => {
  const stringified = JSON.stringify(urlData);
  const b64EncodedJson = utf8_to_b64url(stringified);
  vizType ??= urlData.display;
  return {
    visualizationType: vizType,
    adhocQuestionURL: `/question#${b64EncodedJson}`,
  } as AdhocQuestionData;
};

export const isStringifiedQuery = (maybeJson: string) => {
  try {
    const parsed = JSON.parse(maybeJson);
    const valid =
      typeof parsed === "object" && parsed !== null && "display" in parsed;
    if (valid) {
      return parsed;
    }
  } catch (e) {}
  return false;
};

const promptStyle = [
  "padding: .25rem .5rem; margin-top: 1rem; font-weight: bold; color: #065A82; background: #f3f3e3; width: 100%; display: block; border-bottom: .25rem solid #F9D45C",
  "margin-left: 2rem;",
];

type Column = { display_name: string };

export const getColumnsWithSampleValues = (
  columns: Column[],
  rows: RowValues[],
) => {
  return columns
    .map((col, index) => {
      const values = rows.map(row => row?.[index]);
      const uniqueValues = _.uniq(values)
        .slice(0, 10)
        .filter(
          val => val !== "" && (typeof val !== "string" || val.trim() !== ""),
        )
        .map(val => (typeof val === "string" ? val.replace(/\s+/g, " ") : val))
        .map(val =>
          typeof val === "string"
            ? val.length > 40
              ? `${val.slice(0, 40)}...`
              : val
            : val,
        )
        .map(val => (typeof val === "string" ? `"${val}"` : val))
        .join(", ");
      return `* ${col.display_name} (Sample values: ${uniqueValues})`;
    })
    .join("\n");
};

export const getFieldsForJsonSchema = (fields: Field[]) => {
  return fields.map(field => `${field.display_name}/${field.id}`);
};

// Transform back into correct MBQL
export const transformField = (simplifiedField: any, fields: Field[]) => {
  const fieldId = Number(simplifiedField.split("/")[1]);
  const field = fields.find((f: Field) => f.id === fieldId);
  return getFieldRef(field as any);
};

export const transformFilters = (filters: any, fields: Field[]) => {
  const withFixedFields = transformArrayInFilters(filters, fields);

  // Simplify overcomplicated logical expressions that don't work in MBQL
  if (withFixedFields[0] === "and" && withFixedFields.length === 2) {
    return withFixedFields[1];
  }
  if (withFixedFields[0] === "or" && withFixedFields.length === 2) {
    return withFixedFields[1];
  }
  return withFixedFields;
};

/** Transform filters and their array parts */
export const transformArrayInFilters = (arr: any[], fields: Field[]): any[] => {
  return arr.map(el => {
    if (Array.isArray(el)) {
      return transformArrayInFilters(el, fields); // Recurse for nested arrays
    } else if (typeof el === "string" && el.includes("/")) {
      return transformField(el, fields); // Transform matching strings
    }
    return el;
  });
};

const getFieldRef = (field: Field) => {
  const fieldRef = ["field", field.name, { "base-type": field?.base_type }];
  return fieldRef;
};
