import React, { useState, useMemo } from "react";
import * as Tippy from "@tippyjs/react";

import { isReducedMotionPreferred } from "metabase/lib/dom";
import EventSandbox from "metabase/components/EventSandbox";

const TippyComponent = Tippy.default;
type TippyProps = Tippy.TippyProps;

interface TippyPopoverProps extends TippyProps {
  disableContentSandbox?: boolean;
  lazy?: boolean;
}

const OFFSET: [number, number] = [0, 5];

function TippyPopover({
  disableContentSandbox,
  lazy = true,
  content,
  ...props
}: TippyPopoverProps) {
  const animationDuration = isReducedMotionPreferred() ? 0 : undefined;
  const [mounted, setMounted] = useState(!lazy);
  const plugins = useMemo(
    () => [
      {
        fn: () => ({
          onMount: () => setMounted(true),
          onHidden: () => setMounted(!lazy),
        }),
      },
    ],
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
      {...props}
      plugins={plugins}
      theme="popover"
      arrow={false}
      offset={OFFSET}
      appendTo={() => document.body}
      duration={animationDuration}
      content={computedContent}
    />
  );
}

export default TippyPopover;
