import isPropValid from "@emotion/is-prop-valid";

export function shouldNotForwardTransientProp(propName: string): boolean {
  return !propName.startsWith("$") && isPropValid(propName);
}
