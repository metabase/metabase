import type { FieldType } from "../types";

export function getSharedFieldStyleProps(type?: FieldType) {
  // the file input isn't a Mantine field, so it takes no style props
  if (type === "textFile") {
    return {};
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
