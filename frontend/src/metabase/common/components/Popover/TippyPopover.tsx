import * as TippyReact from "@tippyjs/react";
import cx from "classnames";
import { merge } from "icepick";
import { useCallback, useMemo, useState } from "react";
import type * as tippy from "tippy.js";

import { EventSandbox } from "metabase/common/components/EventSandbox";
import { useSequencedContentCloseHandler } from "metabase/common/hooks/use-sequenced-content-close-handler";
import { getPortalRootElement } from "metabase/css/core/overlays/utils";
import ZIndex from "metabase/css/core/z-index.module.css";
import { isCypressActive } from "metabase/env";
import { isReducedMotionPreferred } from "metabase/lib/dom";

import type { SizeToFitOptions } from "./SizeToFitModifier";
import { sizeToFitModifierFn } from "./SizeToFitModifier";

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
export function TippyPopover({
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
      className={cx("popover", ZIndex.Overlay, className)}
      theme="popover"
      // Tippy's type definition does not support string z-index values
      zIndex={"var(--mb-overlay-z-index)" as unknown as number}
      arrow={false}
      offset={OFFSET}
      appendTo={getPortalRootElement}
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
