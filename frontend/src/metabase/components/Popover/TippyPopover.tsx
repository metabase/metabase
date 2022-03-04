import React, { useState, useMemo, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import * as TippyReact from "@tippyjs/react";
import * as tippy from "tippy.js";
import * as popper from "@popperjs/core";
import cx from "classnames";
import { merge } from "icepick";

import { isReducedMotionPreferred } from "metabase/lib/dom";
import EventSandbox from "metabase/components/EventSandbox";
import { isCypressActive } from "metabase/env";
import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";

const TippyComponent = TippyReact.default;
type TippyProps = TippyReact.TippyProps;
type TippyInstance = tippy.Instance;

export interface ITippyPopoverProps extends TippyProps {
  disableContentSandbox?: boolean;
  lazy?: boolean;
  flip?: boolean;
  maxHeight?: number;
  sizeToFit?: boolean;
}

// space we should leave berween page edge and popover edge when using the `sizeToFit` prop
const PAGE_PADDING = 10;
const DEFAULT_MAX_HEIGHT = 100;
const OFFSET: [number, number] = [0, 5];
const DEFAULT_Z_INDEX = 4;

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
  sizeToFit,
  maxHeight,
  popperOptions,
}: Pick<
  ITippyPopoverProps,
  "flip" | "sizeToFit" | "maxHeight" | "popperOptions"
>): ITippyPopoverProps["popperOptions"] {
  return merge(
    {
      modifiers: [
        {
          name: "flip",
          enabled: flip,
          requiresIfExists: ["sizeToFit"],
        },
        {
          name: "sizeToFit",
          phase: "main",
          enabled: sizeToFit,
          requiresIfExists: ["offset"],
          fn: ({
            state,
            options,
          }: popper.ModifierArguments<Record<string, unknown>>) => {
            const {
              placement,
              rects: {
                popper: { height },
              },
            } = state;

            const overflow = popper.detectOverflow(state, options);
            const distanceFromEdge = placement.startsWith("top")
              ? overflow.top
              : overflow.bottom;
            const minMaxHeight =
              maxHeight == null ? DEFAULT_MAX_HEIGHT : maxHeight;
            const calculatedMaxHeight = Math.max(
              height - distanceFromEdge - PAGE_PADDING,
              minMaxHeight,
            );

            state.styles.popper.maxHeight = `${calculatedMaxHeight}px`;

            // a hack to prevent the popover from flipping until after we've reached the minimum max-height of the popover
            if (calculatedMaxHeight !== minMaxHeight) {
              state.modifiersData.flip._skip = true;
            }
          },
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
  flip = true,
  sizeToFit = false,
  maxHeight,
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
    () => getPopperOptions({ flip, sizeToFit, maxHeight, popperOptions }),
    [flip, sizeToFit, maxHeight, popperOptions],
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
