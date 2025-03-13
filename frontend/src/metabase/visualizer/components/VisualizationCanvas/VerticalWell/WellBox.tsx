import { type ReactNode, forwardRef } from "react";

import { Box } from "metabase/ui";

interface WellBoxProps {
  isHighlighted: boolean;
  isOver: boolean;
  children: ReactNode;
}

export const WellBox = forwardRef<HTMLDivElement, WellBoxProps>(
  function WellBox({ children, isHighlighted, isOver }, ref) {
    const borderColor = isHighlighted
      ? "var(--mb-color-brand)"
      : "var(--mb-color-border)";
    return (
      <Box
        bg={isHighlighted ? "var(--mb-color-brand-light)" : "bg-light"}
        p="sm"
        mih="120px"
        w="150px"
        style={{
          borderRadius: "var(--default-border-radius)",
          border: `1px solid ${borderColor}`,
          transform: isHighlighted ? "scale(1.025)" : "scale(1)",
          transition:
            "transform 0.2s ease-in-out 0.2s, border-color 0.2s ease-in-out 0.2s, background 0.2s ease-in-out 0.2s",
          outline:
            isOver && isHighlighted
              ? "1px solid var(--mb-color-brand)"
              : "none",
        }}
        ref={ref}
      >
        {children}
      </Box>
    );
  },
);
