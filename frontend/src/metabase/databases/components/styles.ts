import type { FieldType } from "../types";

export function getSharedFieldStyleProps(type?: FieldType) {
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
    mb: "lg",
    ...labelProps,
  };
}
