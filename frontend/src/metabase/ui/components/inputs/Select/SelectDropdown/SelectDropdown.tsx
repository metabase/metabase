import type { HTMLAttributes, Ref } from "react";
import { forwardRef, useEffect } from "react";

import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";

// hack to prevent parent TippyPopover from closing when selecting an item in Select
// remove when TippyPopover is no longer used
export const SelectDropdown = forwardRef(function SelectDropdown(
  props: HTMLAttributes<HTMLDivElement>,
  ref: Ref<HTMLDivElement>,
) {
  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();

  useEffect(() => {
    setupCloseHandler(document.body, () => undefined);
    return () => removeCloseHandler();
  }, [setupCloseHandler, removeCloseHandler]);

  return <div ref={ref} {...props} />;
});
