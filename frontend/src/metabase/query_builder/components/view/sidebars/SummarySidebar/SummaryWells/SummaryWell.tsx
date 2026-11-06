import type { MouseEvent, ReactNode } from "react";

import { Card, Flex, Text } from "metabase/ui";

import S from "../SummarySidebar.module.css";
import type { SummaryWellId } from "../types";

// clicks on these keep their own behavior instead of focusing the well's field
const INTERACTIVE_SELECTOR =
  "button, input, a, [role='button'], [contenteditable='true']";

type SummaryWellProps = {
  wellId: SummaryWellId;
  title: string;
  children: ReactNode;
};

export function SummaryWell({ wellId, title, children }: SummaryWellProps) {
  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof Element) ||
      event.target.closest(INTERACTIVE_SELECTOR)
    ) {
      return;
    }
    const field = event.currentTarget.querySelector("input");
    if (field) {
      // keep the mousedown from blurring the field we're about to focus
      event.preventDefault();
      field.focus();
    }
  };

  return (
    <Card
      className={S.well}
      radius="lg"
      shadow="xs_outline"
      p="md"
      data-testid={`summary-well-${wellId}`}
      onMouseDown={handleMouseDown}
    >
      <Flex className={S.wellHeader}>
        <Text className={S.wellTitle}>{title}</Text>
      </Flex>
      {children}
    </Card>
  );
}
