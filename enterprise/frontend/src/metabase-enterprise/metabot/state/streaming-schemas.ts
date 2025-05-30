import * as Yup from "yup";

function constant<T extends NonNullable<unknown>>(value: T) {
  return Yup.mixed<T>().oneOf([value]).default(value);
}

const toolMessageSchema = Yup.object({
  role: constant("tool" as const),
  tool_call_id: Yup.string().required(),
  content: Yup.string().nullable(),
});

const assistantToolCallSchema = Yup.object({
  id: Yup.string().required(),
  name: Yup.string().required(),
  arguments: Yup.string().required(),
});

const assistantMessageSchema = Yup.object({
  role: constant("assistant" as const),
  content: Yup.string().nullable(),
  navigate_to: Yup.string().nullable(),
  tool_calls: Yup.array().of(assistantToolCallSchema).nullable(),
});

const userMessageSchema = Yup.object({
  role: constant("user" as const),
  content: Yup.string(),
});

const systemMessageSchema = Yup.object({
  role: constant("system" as const),
});

const messageSchema = Yup.lazy((value) => {
  if (value.role === "system") {
    return systemMessageSchema;
  } else if (value.role === "assistant") {
    return assistantMessageSchema;
  } else if (value.role === "tool") {
    return toolMessageSchema;
  } else if (value.role === "user") {
    return userMessageSchema;
  }
  throw new Error("Non existing message schema");
});

export type StreamingMessageSchema =
  | Yup.InferType<typeof assistantMessageSchema>
  | Yup.InferType<typeof systemMessageSchema>
  | Yup.InferType<typeof toolMessageSchema>
  | Yup.InferType<typeof userMessageSchema>;

export const streamingPayloadSchema = Yup.object({
  type: constant("message").required(),
  data: Yup.object({
    message: messageSchema,
    state: Yup.object().nullable(),
    metadata: Yup.object().nullable(),
  }),
});
