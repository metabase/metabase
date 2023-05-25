import React, { ReactNode, cloneElement } from "react";

import Tooltip from "metabase/core/components/Tooltip";

import { RenderTriggerElement } from "./types";
import { isReactElement, isRenderProp } from "./utils";

interface Props {
  isOpen?: boolean;
  triggerElement?: ReactNode | RenderTriggerElement;
  onClose: () => void;
  onOpen: () => void;
}

export function TriggerElement({
  isOpen,
  triggerElement,
  onClose,
  onOpen,
}: Props) {
  if (isReactElement(triggerElement) && triggerElement.type === Tooltip) {
    // Disables tooltip when open:
    return cloneElement(triggerElement, {
      isEnabled: triggerElement.props.isEnabled && !isOpen,
    });
  }

  if (isRenderProp(triggerElement)) {
    return (
      <>
        {triggerElement({
          isTriggeredComponentOpen: isOpen,
          close: onClose,
          open: onOpen,
        })}
      </>
    );
  }

  return <>{triggerElement}</>;
}
