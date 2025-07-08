import cx from "classnames";
import { type ReactNode, forwardRef } from "react";

import { Flex } from "metabase/ui";

import S from "../well.module.css";

interface SimpleVerticalWellProps {
  hasValues: boolean;
  isHighlighted: boolean;
  isOver: boolean;
  children: ReactNode;
}

export const SimpleVerticalWell = forwardRef<
  HTMLDivElement,
  SimpleVerticalWellProps
>(function SimpleVerticalWell({ isHighlighted, isOver, children }, ref) {
  return (
    <Flex
      className={cx(S.Well, {
        [S.isOver]: isOver,
        [S.isActive]: isHighlighted,
      })}
      h="100%"
      w="42px"
      align="center"
      justify="center"
      p="xs"
      style={{
        containerType: "size",
      }}
      ref={ref}
    >
      {children}
    </Flex>
  );
});
