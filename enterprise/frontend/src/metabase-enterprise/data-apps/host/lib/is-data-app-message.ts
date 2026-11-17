export function isDataAppMessage<Type extends string>(
  data: unknown,
  type: Type,
): data is { type: Type } & Record<string, unknown> {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    data.type === type
  );
}
