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
    return (
      <Flex
        ref={ref}
        className={S.vertical}
        align="center"
        justify="center"
        pos="absolute"
        w="sm"
        h="100%"
        top={0}
        left={rem(-4)}
        {...rest}
      >
        <Box w="xs" h={THICKNESS} bg="border" />
      </Flex>
    );
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
        <Box w={THICKNESS} h="xs" bg="border" />
      </Flex>
    );
  }
  return null;
});
