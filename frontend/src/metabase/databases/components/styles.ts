import type { FieldType } from "../types";

export function getSharedFieldStyleProps(type?: FieldType) {
  // the file input isn't a Mantine field, so it takes the label gap as `gap`
  // rather than through `labelProps`
  if (type === "textFile") {
    return { mb: "xl", gap: "sm" };
  }

  // our boolean (Switch) fields don't support the labelProps
  const labelProps =
    type !== "boolean"
      ? {
          labelProps: {
            mb: "sm",
          },
        }
      : undefined;

  return {
    mb: "xl",
    ...labelProps,
  };
}
