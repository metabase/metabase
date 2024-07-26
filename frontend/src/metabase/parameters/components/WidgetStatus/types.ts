/**
 * clear - to indicate the value can be removed
 * reset - to indicate the value can be reset to default
 * empty - to indicate the value can be selected
 * none - when the component is not needed, but we still render it to preserve space for it
 */
export type Status = "clear" | "reset" | "empty" | "none";
