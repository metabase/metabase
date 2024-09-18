import _ from "underscore";

import { utf8_to_b64url } from "metabase/lib/encoding";

import type { AdhocQuestionData, QueryField } from "./types";
import { Tool } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/constants/agent-tools-spec";
import { getToolSpec } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/constants/agent-tools-spec";
import {
  METABOT_AGENT_TOOLS_SPEC,
  Tool,
} from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/constants/agent-tools-spec";
import { Field, RowValues } from "metabase-types/api";

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
