import _ from "underscore";

import { utf8_to_b64url } from "metabase/lib/encoding";

import type { AdhocQuestionData, QueryField } from "./types";
import {
  getToolSpec,
  Tool,
} from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/constants/agent-tools-spec";

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

const sendPrompt = async (
  prompt: string,
  systemPrompt?: string,
  fields?: QueryField[],
  apiPath = "experimental/viz-agent/",
  // Another option is /v1/chat/
) => {
  // eslint-disable-next-line no-console
  console.log(`%cPrompt sent to LLM:%c\n ${prompt}`, ...promptStyle);
  const body = getBody({
    content: prompt,
    systemPrompt,
    fields,
    tools: getToolSpec(),
  });
  const results = await fetch(`http://0.0.0.0:8000/${apiPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
  return results;
};

export const getLLMResponse = async (
  prompt: string,
  systemPrompt?: string,
  fields?: QueryField[],
) => {
  const response = await sendPrompt(prompt, systemPrompt, fields);
  const json = (await response.json()) as any;
  const responseContent = json.message.content as string;
  const toolCalls = json.message.tool_calls.map(
    (tc: any) => `${tc.function?.name} called with ${tc.function?.arguments}`,
  );
  // eslint-disable-next-line no-console
  console.log("LLM says", responseContent);
  // eslint-disable-next-line no-console
  console.log("toolCalls", "\n" + toolCalls.join("\n"));
  // The response might be encoded json
  try {
    const parsed = JSON.parse(responseContent) as {
      tool_output: string;
      assistant_output: string;
    };
    const { tool_output, assistant_output } = parsed;
    return { tool_output, assistant_output };
  } catch {
    return { assistant_output: responseContent };
  }
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
  rows: (string | number)[][],
) => {
  return columns
    .map((col, index) => {
      const values = rows.map(row => row[index]);
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
