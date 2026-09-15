import type ts from "typescript";

import { typeText } from "./typescript-utils";

/** What one side of a comparison holds at a position: a type, or what the client sends there. */
export type Shape =
  | { kind: "type"; type: ts.Type }
  | { kind: "text"; text: string }
  | { kind: "null"; from: ts.Type; reason?: string }
  | { kind: "empty"; from: ts.Type; reason?: string }
  | { kind: "throws"; from: ts.Type; reason: string }
  | { kind: "unverified"; from: ts.Type; reason: string }
  | {
      kind: "object";
      from: ts.Type | undefined;
      description?: string;
      fields: ShapeField[];
      indexes: ShapeIndex[];
    }
  | { kind: "array"; from: ts.Type; element: Shape }
  /** A query array, sent as one value per item. */
  | { kind: "items"; from: ts.Type; item: Shape }
  | { kind: "union"; from?: ts.Type; members: Shape[] };

export interface ShapeField {
  name: string;
  shape: Shape;
  optional: boolean;
  declaration: ts.Declaration | undefined;
}

export interface ShapeIndex {
  keyType: ts.Type;
  shape: Shape;
  declaration: ts.Declaration | undefined;
}

export function typeShape(type: ts.Type): Shape {
  return { kind: "type", type };
}

export function unionShape(members: Shape[]): Shape {
  const [only] = members;
  return only && members.length === 1 ? only : { kind: "union", members };
}

export function describeShape(checker: ts.TypeChecker, view: Shape): string {
  let remaining = 200;
  const describe = (view: Shape): string => {
    if (--remaining < 0) {
      return "…";
    }
    switch (view.kind) {
      case "text":
        return JSON.stringify(view.text);
      case "items":
        return `(${describe(view.item)})[]`;
      case "type":
        return typeText(checker, view.type);
      case "null":
        return "null";
      case "empty":
        return "{}";
      case "throws":
      case "unverified":
        return typeText(checker, view.from);
      case "array": {
        const element = describe(view.element);
        return view.element.kind === "union"
          ? `(${element})[]`
          : `${element}[]`;
      }
      case "union":
        return view.members.map(describe).join(" | ");
      case "object":
        return (
          view.description ??
          `{ ${view.fields.map((field) => `${field.name}${field.optional ? "?" : ""}: ${describe(field.shape)};`).join(" ")} }`
        );
    }
  };
  return describe(view);
}
