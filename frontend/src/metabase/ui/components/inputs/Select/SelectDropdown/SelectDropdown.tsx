import { forwardRef, useEffect, useRef } from "react";
import type { HTMLAttributes, Ref } from "react";
import { useMergedRef } from "@mantine/hooks";
import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";

// hack to prevent Select from closing TippyPopover when selecting an item
// remove when TippyPopover is no longer used
export const SelectDropdown = forwardRef(function SelectDropdown(
  props: HTMLAttributes<HTMLDivElement>,
  outerRef: Ref<HTMLDivElement>,
) {
  const innerRef = useRef<HTMLDivElement>();
  const mergedRef = useMergedRef(innerRef, outerRef);
  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();

  useEffect(() => {
    if (innerRef.current) {
      setupCloseHandler(innerRef.current, () => undefined);
      return () => removeCloseHandler();
    }
  }, [setupCloseHandler, removeCloseHandler]);

  return <div ref={mergedRef} {...props} />;
});
