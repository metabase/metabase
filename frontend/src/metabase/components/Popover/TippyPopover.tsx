import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import * as TippyReact from "@tippyjs/react";
import * as tippy from "tippy.js";
import cx from "classnames";

import { isReducedMotionPreferred } from "metabase/lib/dom";
import EventSandbox from "metabase/components/EventSandbox";
import { isCypressActive } from "metabase/env";

const TippyComponent = TippyReact.default;
type TippyProps = TippyReact.TippyProps;
type TippyInstance = tippy.Instance;

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

function appendTo() {
  return document.body;
}

const hideOnEscPlugin = {
  name: "hideOnEsc",
  fn({ hide }: TippyInstance) {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        hide();
      }
    }

    return {
      onShow() {
        document.addEventListener("keydown", onKeyDown);
      },
      onHide() {
        document.removeEventListener("keydown", onKeyDown);
      },
    };
  },
};

function TippyPopover({
  className,
  disableContentSandbox,
  content,
  delay,
  lazy = true,
  ...props
}: ITippyPopoverProps) {
  delay = isCypressActive ? 0 : delay;
  const animationDuration = isReducedMotionPreferred() ? 0 : undefined;
  const [mounted, setMounted] = useState(!lazy);
  const shouldShowContent = mounted && content != null;

  const lazyPlugin = useMemo(
    () => ({
      name: "lazy",
      fn: () => ({
        onMount: () => setMounted(true),
        onHidden: () => setMounted(!lazy),
      }),
    }),
    [lazy],
  );

  const plugins = useMemo(() => [lazyPlugin, hideOnEscPlugin], [lazyPlugin]);

  return (
    <TippyComponent
      className={cx("popover", className)}
      theme="popover"
      arrow={false}
      offset={OFFSET}
      appendTo={appendTo}
      plugins={plugins}
      {...props}
      duration={animationDuration}
      delay={delay}
      content={
        shouldShowContent ? (
          <EventSandbox disabled={disableContentSandbox}>
            {content}
          </EventSandbox>
        ) : null
      }
    />
  );
}

TippyPopover.propTypes = propTypes;

export default TippyPopover;
