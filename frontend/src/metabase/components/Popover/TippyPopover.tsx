import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import * as Tippy from "@tippyjs/react";
import cx from "classnames";

import { isReducedMotionPreferred } from "metabase/lib/dom";
import EventSandbox from "metabase/components/EventSandbox";
import { isCypressActive } from "metabase/env";

const TippyComponent = Tippy.default;
type TippyProps = Tippy.TippyProps;

export interface ITippyPopoverProps extends TippyProps {
  disableContentSandbox?: boolean;
  lazy?: boolean;
}

const OFFSET: [number, number] = [0, 5];

const propTypes = {
  disablContentSandbox: PropTypes.bool,
  lazy: PropTypes.bool,
  ...TippyComponent.propTypes,
};

function TippyPopover({
  className,
  disableContentSandbox,
  lazy = true,
  content,
  delay,
  ...props
}: ITippyPopoverProps) {
  delay = isCypressActive ? 0 : delay;
  const animationDuration = isReducedMotionPreferred() ? 0 : undefined;
  const [mounted, setMounted] = useState(!lazy);
  const plugins = useMemo(
    () =>
      lazy
        ? [
            {
              fn: () => ({
                onMount: () => setMounted(true),
                onHidden: () => setMounted(false),
              }),
            },
          ]
        : [],
    [lazy],
  );

  let computedContent;
  if (!mounted) {
    computedContent = "";
  } else if (content != null) {
    computedContent = (
      <EventSandbox disabled={disableContentSandbox}>{content}</EventSandbox>
    );
  }

  return (
    <TippyComponent
      className={cx("popover", className)}
      theme="popover"
      arrow={false}
      offset={OFFSET}
      appendTo={() => document.body}
      plugins={plugins}
      {...props}
      duration={animationDuration}
      delay={delay}
      content={computedContent}
    />
  );
}

TippyPopover.propTypes = propTypes;

export default TippyPopover;
