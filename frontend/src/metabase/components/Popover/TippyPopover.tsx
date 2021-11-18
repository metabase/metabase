import React from "react";
import PropTypes from "prop-types";
import * as Tippy from "@tippyjs/react";

import { isReducedMotionPreferred } from "metabase/lib/dom";
import EventSandbox from "metabase/components/EventSandbox";

const TippyComponent = Tippy.default;
type TippyProps = Tippy.TippyProps;

TippyPopover.propTypes = {
  children: PropTypes.node,
  renderContent: PropTypes.func.isRequired,
};

interface TippyPopoverProps extends TippyProps {
  disableContentSandbox?: boolean;
}

const OFFSET: [number, number] = [0, 5];

function TippyPopover({
  content,
  disableContentSandbox,
  ...props
}: TippyPopoverProps) {
  const animationDuration = isReducedMotionPreferred() ? 0 : undefined;

  return (
    <TippyComponent
      {...props}
      theme="popover"
      arrow={false}
      offset={OFFSET}
      appendTo={() => document.body}
      duration={animationDuration}
      content={
        content != null ? (
          <EventSandbox disabled={disableContentSandbox}>
            {content}
          </EventSandbox>
        ) : (
          undefined
        )
      }
    />
  );
}

export default TippyPopover;
