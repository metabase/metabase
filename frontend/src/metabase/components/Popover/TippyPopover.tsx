import * as TippyReact from "@tippyjs/react";
import cx from "classnames";
import { merge } from "icepick";
import { useCallback, useMemo, useState } from "react";
import type * as tippy from "tippy.js";

import { getPortalRootElement } from "embedding-sdk/config";
import EventSandbox from "metabase/components/EventSandbox";
import ZIndex from "metabase/css/core/z-index.module.css";
import { isCypressActive } from "metabase/env";
import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import { useMantineTheme } from "metabase/ui";

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

  const theme = useMantineTheme();

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

  const zIndex =
    theme.other.popover?.zIndex ||
    ("var(--mb-floating-element-z-index)" as unknown as number);

  return (
    <TippyComponent
      className={cx(
        "popover",
        // FIXME: Is the theme popover zindex respected here?
        ZIndex.FloatingElement,
        className,
      )}
      theme="popover"
      zIndex={zIndex}
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
            {/*
            FIXME: removing this div for now
            <div style={{ zIndex: zIndex }}>*/}
            {content}
            {/*</div>*/}
          </EventSandbox>
        ) : null
      }
      onShow={handleShow}
      onHide={handleHide}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TippyPopover;
