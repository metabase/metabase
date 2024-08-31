import { AdhocQuestionData, PydanticModelSchemaName } from "./types";
import { utf8_to_b64url } from "metabase/lib/encoding";
const progressIntervalDelay = 200;

const getBody = ({
  content,
  modelSchemaName,
  systemPrompt,
}: {
  content: string;
  modelSchemaName?: PydanticModelSchemaName;
  systemPrompt?: string;
}) =>
  JSON.stringify({
    // model: "meta.llama3-1-8b-instruct-v1:0",
    // model: "meta.llama3-1-70b-instruct-v1:0",
    // model: "mistral.mixtral-8x7b-instruct-v0:1",
    // model: "mistral.mistral-large-2402-v1:0",
    model: "gpt-4o-2024-08-06",
    messages: [
      ...(systemPrompt
        ? [
            {
              content: `Your name is Metabot. ${systemPrompt}`,
              role: "system",
            },
          ]
        : []),
      {
        content,
        role: "user",
      },
    ],
    ...(modelSchemaName ? { response_schema_model: modelSchemaName } : {}),
  });

const sendPrompt = async (
  prompt: string,
  modelSchemaName?: PydanticModelSchemaName,
  systemPrompt?: string,
) => {
  console.log(
    `%cPrompt sent to LLM:%c\n ${prompt}`,
    "padding: .25rem .5rem; margin-top: 1rem; font-weight: bold; color: #065A82; background: #f3f3e3; width: 100%; display: block; border-bottom: .25rem solid #F9D45C",
    "margin-left: 2rem;",
  );

  const results = await fetch("http://0.0.0.0:8000/v1/chat/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: getBody({ content: prompt, modelSchemaName, systemPrompt }),
  });
  return results;
};

export const getLLMResponse = async (
  prompt: string,
  modelSchemaName?: PydanticModelSchemaName,
  systemPrompt?: string,
) => {
  const response = await sendPrompt(prompt, modelSchemaName, systemPrompt);
  const responseContent = ((await response.json()) as { response: string })
    .response;
  console.log("LLM says", responseContent);
  return responseContent;
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
