import { type HTMLAttributes, type Ref, forwardRef } from "react";
import _ from "underscore";

import { Box, Flex, rem } from "metabase/ui";

import S from "./ResizableBoxHandle.module.css";

export const ResizableBoxHandle = forwardRef(function ResizableBoxHandle(
  props: HTMLAttributes<HTMLDivElement>,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Flex
      ref={ref}
      className={S.root}
      align="center"
      justify="center"
      w="100%"
      h="sm"
      pos="absolute"
      bottom={`-${rem(4)}`}
      {..._.omit(props, "handleAxis")}
    >
      <Box w="6.25rem" h="xs" bg="border" />
    </Flex>
  );
});
