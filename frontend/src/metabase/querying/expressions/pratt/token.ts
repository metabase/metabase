import type { NodeType } from "./node";

export class Token {
  type: NodeType;
  text: string;
  value?: string;

  start: number;
  end: number;

  constructor({
    type,
    start,
    end,
    text,
    value,
  }: {
    type: NodeType;
    text: string;
    value?: string;
    start: number;
    end: number;
  }) {
    this.type = type;
    this.start = start;
    this.end = end;

    this.text = text;
    this.value = value;
  }
  get length(): number {
    return this.end - this.start;
  }
}
