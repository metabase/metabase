import { parseMarkdown } from "./parseMarkdown";

export type Root = ReturnType<typeof parseMarkdown>;

export type Content = Root["children"];

export type ArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

export type Node = ArrayElement<Content>;
