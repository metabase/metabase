import { useEffect } from "react";
import type { HTMLAttributes } from "react";
import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";

// hack to prevent parent TippyPopover from closing when selecting an item in Select
// remove when TippyPopover is no longer used
export function SelectDropdown(props: HTMLAttributes<HTMLDivElement>) {
  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();

  useEffect(() => {
    setupCloseHandler(document.body, () => undefined);
    return () => removeCloseHandler();
  }, [setupCloseHandler, removeCloseHandler]);

  return <div {...props} />;
}
