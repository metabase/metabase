import { type ReactNode, forwardRef } from "react";

import { Flex } from "metabase/ui";

interface SimpleVerticalWellProps {
  hasValues: boolean;
  isHighlighted: boolean;
  isOver: boolean;
  children: ReactNode;
}

export const SimpleVerticalWell = forwardRef<
  HTMLDivElement,
  SimpleVerticalWellProps
>(function SimpleVerticalWell(
  { hasValues, isHighlighted, isOver, children },
  ref,
) {
  const borderStyle = hasValues ? "solid" : "dashed";
  const borderColor = isHighlighted
    ? "var(--mb-color-brand)"
    : "var(--border-color)";

  return (
    <Flex
      h="100%"
      w="42px"
      align="center"
      justify="center"
      bg={isHighlighted ? "var(--mb-color-brand-light)" : "bg-light"}
      p="md"
      wrap="nowrap"
      style={{
        borderRadius: "var(--border-radius-xl)",
        border: `1px ${borderStyle} ${borderColor}`,
        transform: isHighlighted ? "scale(1.025)" : "scale(1)",
        transition:
          "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
        outline:
          isOver && isHighlighted ? "1px solid var(--mb-color-brand)" : "none",
        containerType: "size",
      }}
      ref={ref}
    >
      {children}
    </Flex>
  );
});
