import isPropValid from "@emotion/is-prop-valid";

export function shouldForwardNonTransientProp(propName: string): boolean {
  return !propName.startsWith("$") && isPropValid(propName);
}
