import type { PropsWithChildren } from "react";

import { Box } from "metabase/ui";

import S from "./CompactPinnedItemCard.module.css";

type Props = PropsWithChildren<{
  name: string;
  isSelected: boolean;
  onToggle: () => void;
  onHighlightChange: (isHighlighted: boolean) => void;
}>;

export function SelectModeCardWrapper({
  name,
  isSelected,
  onToggle,
  onHighlightChange,
  children,
}: Props) {
  return (
    <Box
      aria-checked={isSelected}
      aria-label={name}
      className={S.link}
      role="checkbox"
      tabIndex={0}
      onBlur={(event) => {
        if (event.target === event.currentTarget) {
          onHighlightChange(false);
        }
      }}
      onClick={onToggle}
      onFocus={(event) => {
        if (event.target === event.currentTarget) {
          onHighlightChange(true);
        }
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          onToggle();
        }
      }}
      onMouseEnter={() => onHighlightChange(true)}
      onMouseLeave={() => onHighlightChange(false)}
    >
      {children}
    </Box>
  );
}
