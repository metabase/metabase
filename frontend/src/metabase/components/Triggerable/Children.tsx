import React, { ReactNode, SyntheticEvent, cloneElement } from "react";

import { RenderProp } from "./types";
import { isReactElement, isRenderProp } from "./utils";

interface Props {
  children:
    | ReactNode
    | RenderProp<{ onClose: (event: SyntheticEvent) => void }>;
  isOpen: boolean;
  onClose: (event: SyntheticEvent) => void;
}

export function Children({ children, isOpen, onClose }: Props) {
  if (isRenderProp(children) && isOpen) {
    return <>{children({ onClose })}</>;
  }

  if (React.Children.count(children) === 1) {
    const child = React.Children.only(children);

    if (isReactElement(child)) {
      const isHtmlElement = child.type === "string";
      const hasOnCloseProp = typeof child.props.onClose !== "undefined";

      if (!isHtmlElement && !hasOnCloseProp) {
        return cloneElement(child, { onClose });
      }
    }
  }

  return <>{children}</>;
}
