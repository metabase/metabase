import type { FieldType } from "../types";

export function getSharedFieldStyleProps(type?: FieldType) {
  return {
    mb: "xl",
    // the file input isn't a Mantine field, so it sets the label gap itself
    ...(type === "textFile" ? { gap: "xs" } : {}),
  };
}
