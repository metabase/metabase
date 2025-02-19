import { type FormatOptions, format as _format } from "./formatter";

export function format(
  expr: string,
  options: Omit<FormatOptions, "printWidth">,
) {
  return _format(expr, {
    ...options,
    printWidth: Infinity,
  });
}
