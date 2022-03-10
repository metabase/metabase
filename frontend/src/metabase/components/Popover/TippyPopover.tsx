import React, { useState, useMemo, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import * as TippyReact from "@tippyjs/react";
import * as tippy from "tippy.js";
import cx from "classnames";
import { merge } from "icepick";

import { isReducedMotionPreferred } from "metabase/lib/dom";
import EventSandbox from "metabase/components/EventSandbox";
import { isCypressActive } from "metabase/env";
import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";

import { DEFAULT_Z_INDEX } from "./constants";

const TippyComponent = TippyReact.default;
type TippyProps = TippyReact.TippyProps;
type TippyInstance = tippy.Instance;

export interface ITippyPopoverProps extends TippyProps {
  disableContentSandbox?: boolean;
  lazy?: boolean;
  flip?: boolean;
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

function getPopperOptions({
  flip,
  popperOptions = {},
}: Pick<ITippyPopoverProps, "flip" | "popperOptions">) {
  return merge(
    {
      modifiers: [
        {
          name: "flip",
          enabled: flip,
        },
      ],
    },
    popperOptions,
  );
}

function TippyPopover({
  className,
  disableContentSandbox,
  content,
  delay,
  lazy = true,
  interactive = true,
  flip = true,
  popperOptions,
  onShow,
  onHide,
  ...props
}: ITippyPopoverProps) {
  delay = isCypressActive ? 0 : delay;
  const animationDuration = isReducedMotionPreferred() ? 0 : undefined;
  const [mounted, setMounted] = useState(!lazy);
  const shouldShowContent = mounted && content != null;

  const {
    setupCloseHandler,
    removeCloseHandler,
  } = useSequencedContentCloseHandler();

  const handleShow = useCallback(
    (instance: TippyInstance) => {
      setupCloseHandler(instance.popper, () => instance.hide());

      if (typeof onShow === "function") {
        return onShow(instance);
      }
    },
    [onShow, setupCloseHandler],
  );

  const handleHide = useCallback(
    (instance: TippyInstance) => {
      removeCloseHandler();

      if (typeof onHide === "function") {
        return onHide(instance);
      }
    },
    [onHide, removeCloseHandler],
  );

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

  const plugins = useMemo(() => [lazyPlugin], [lazyPlugin]);

  const computedPopperOptions = useMemo(
    () => getPopperOptions({ flip, popperOptions }),
    [flip, popperOptions],
  );

  return (
    <TippyComponent
      className={cx("popover", className)}
      theme="popover"
      zIndex={DEFAULT_Z_INDEX}
      arrow={false}
      offset={OFFSET}
      appendTo={appendTo}
      plugins={plugins}
      {...props}
      popperOptions={computedPopperOptions}
      interactive={interactive}
      duration={animationDuration}
      delay={delay}
      content={
        shouldShowContent ? (
          <EventSandbox disabled={disableContentSandbox}>
            {content}
          </EventSandbox>
        ) : null
      }
      onShow={handleShow}
      onHide={handleHide}
    />
  );
}

TippyPopover.propTypes = propTypes;

export default TippyPopover;
