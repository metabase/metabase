import { type HTMLAttributes, type Ref, forwardRef } from "react";

import { Box, Flex, rem } from "metabase/ui";

import S from "./ResizeHandle.module.css";

type ResizeHandleProps = HTMLAttributes<HTMLDivElement> & {
  handleAxis?: "n" | "e" | "s" | "w";
};

const THICKNESS = "6.25rem";

export const ResizeHandle = forwardRef(function ResizableBoxHandle(
  props: ResizeHandleProps,
  ref: Ref<HTMLDivElement>,
) {
  const { handleAxis, ...rest } = props;

  if (handleAxis === "e" || handleAxis === "w") {
    // No affordance until hovered: a col-resize cursor plus a border-strong
    // divider appear only when the pointer is over the panel's inner edge.
    return <div ref={ref} className={S.vertical} {...rest} />;
  } else if (handleAxis === "s" || handleAxis === "n") {
    return (
      <Flex
        ref={ref}
        className={S.horizontal}
        align="center"
        justify="center"
        pos="absolute"
        w="100%"
        h="sm"
        bottom={rem(-4)}
        {...rest}
      >
        <Box w={THICKNESS} h="xxs" bg="border-neutral" />
      </Flex>
    );
  }
  return null;
});
