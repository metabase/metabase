export const PROMPT_RETURN_TYPES = [
  "text",
  "integer",
  "float",
  "boolean",
  "date",
  "datetime",
] as const;

export const NAMED_ARGS = {
  returnType: {
    option: "return-type",
    values: PROMPT_RETURN_TYPES,
    example: "integer",
  },
  jsonSchema: {
    option: "json-schema",
    example: '{"type": "integer"}',
  },
} as const satisfies Record<
  string,
  { option: string; values?: readonly string[]; example: string }
>;

export type NamedArgName = keyof typeof NAMED_ARGS;

type NamedArgValue<A> = A extends { values: readonly (infer V)[] } ? V : string;

export type NamedArgOptions = {
  [N in NamedArgName as (typeof NAMED_ARGS)[N]["option"]]?: NamedArgValue<
    (typeof NAMED_ARGS)[N]
  >;
};

export type NamedArgConfig = {
  name: NamedArgName;
  option: (typeof NAMED_ARGS)[NamedArgName]["option"];
  values?: readonly string[];
  example?: string;
  description: string;
};
