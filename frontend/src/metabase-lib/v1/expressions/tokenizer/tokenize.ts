import { parser } from "./parser";

export function tokenize(source: string) {
  const tree = parser.parse(source);
  return tree.cursor();
}
