import type { NodeType } from "./node";

export class Token {
  type: NodeType;
  text: string;
  value?: string;

  pos: number;
  length: number;

  constructor({
    type,
    pos,
    length,
    text,
    value,
  }: {
    type: NodeType;
    text: string;
    value?: string;
    length: number;
    pos: number;
  }) {
    this.type = type;
    this.pos = pos;
    this.length = length;

    this.text = text;
    this.value = value;
  }
  get start(): number {
    return this.pos;
  }
  get end(): number {
    return this.pos + this.length;
  }
}
