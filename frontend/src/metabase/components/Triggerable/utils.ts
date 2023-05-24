import { ReactElement } from "react";
import { isObject } from "underscore";

import { RenderProp } from "./types";

export const isChildrenRenderProp = <Props extends Record<string, unknown>>(
  value: unknown,
): value is RenderProp<Props> => {
  return typeof value === "function";
};

export const isReactElement = (value: unknown): value is ReactElement => {
  return (
    isObject(value) &&
    typeof value.type === "string" &&
    isObject(value.props) &&
    (typeof value.key === "string" ||
      typeof value.key === "number" ||
      value.key === null)
  );
};
