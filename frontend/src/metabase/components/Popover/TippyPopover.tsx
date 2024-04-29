import * as TippyReact from "@tippyjs/react";
import cx from "classnames";
import { merge } from "icepick";
import PropTypes from "prop-types";
import { useState, useMemo, useCallback } from "react";
import type * as tippy from "tippy.js";

import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import EventSandbox from "metabase/components/EventSandbox";
import { isCypressActive } from "metabase/env";
import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";
import { isReducedMotionPreferred } from "metabase/lib/dom";

import type { SizeToFitOptions } from "./SizeToFitModifier";
import { sizeToFitModifierFn } from "./SizeToFitModifier";
import { DEFAULT_Z_INDEX } from "./constants";

const TippyComponent = TippyReact.default;
type TippyProps = TippyReact.TippyProps;
type TippyInstance = tippy.Instance;

export interface ITippyPopoverProps extends TippyProps {
  disableContentSandbox?: boolean;
  lazy?: boolean;
  flip?: boolean;
  sizeToFit?: boolean | SizeToFitOptions;
  onClose?: () => void;
}

const OFFSET: [number, number] = [0, 5];

const propTypes = {
  disablContentSandbox: PropTypes.bool,
  lazy: PropTypes.bool,
  ...TippyComponent.propTypes,
};

function appendTo() {
  return (
    document.getElementById(EMBEDDING_SDK_ROOT_ELEMENT_ID) || document.body
  );
}

function getPopperOptions({
  flip,
  sizeToFit,
  popperOptions = {},
}: Pick<ITippyPopoverProps, "flip" | "sizeToFit" | "popperOptions">) {
  return merge(
    {
      modifiers: [
        {
          name: "flip",
          enabled: flip && !sizeToFit,
        },
        {
          name: "sizeToFit",
          phase: "beforeWrite",
          enabled: sizeToFit !== false,
          requiresIfExists: ["offset"],
          fn: sizeToFitModifierFn,
          options: typeof sizeToFit === "object" ? sizeToFit : undefined,
        },
      ],
    },
    popperOptions,
  );
}

/**
 * @deprecated prefer Popover from "metabase/ui" instead
 */
function TippyPopover({
  className,
  disableContentSandbox,
  content,
  delay,
  lazy = true,
  interactive = true,
  flip = true,
  sizeToFit = false,
  popperOptions,
  onShow,
  onHide,
  onClose,
  ...props
}: ITippyPopoverProps) {
  delay = isCypressActive ? 0 : delay;
  const animationDuration = isReducedMotionPreferred() ? 0 : undefined;
  const [mounted, setMounted] = useState(!lazy);
  const shouldShowContent = mounted && content != null;
  const isControlled = props.visible != null;

  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();

  const handleShow = useCallback(
    (instance: TippyInstance) => {
      setupCloseHandler(instance.popper, () =>
        isControlled ? onClose?.() : instance.hide(),
      );

      if (typeof onShow === "function") {
        return onShow(instance);
      }
    },
    [setupCloseHandler, onShow, isControlled, onClose],
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
    () => getPopperOptions({ flip, sizeToFit, popperOptions }),
    [flip, sizeToFit, popperOptions],
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TippyPopover;
