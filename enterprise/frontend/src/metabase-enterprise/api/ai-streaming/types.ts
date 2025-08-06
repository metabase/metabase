/**
A JSON value can be a string, number, boolean, object, array, or null.
JSON values can be serialized and deserialized by the JSON.stringify and JSON.parse methods.
 */
export type JSONValue =
  | null
  | string
  | number
  | boolean
  | { [value: string]: JSONValue }
  | Array<JSONValue>;
