import { useDroppable } from "@dnd-kit/core";
import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  createContext,
  useContext,
  useRef,
} from "react";

import { useFocusFallback } from "metabase/common/hooks/use-focus-fallback";
import { Card, Flex, Text } from "metabase/ui";

import S from "../SummarySidebar.module.css";
import type { SummaryWellId } from "../types";

// clicks on these keep their own behavior instead of focusing the well's field
const INTERACTIVE_SELECTOR =
  "button, input, a, [role='button'], [contenteditable='true']";

const WellFieldContext =
  createContext<RefObject<HTMLInputElement | null> | null>(null);

/** The typeahead field of the surrounding well. */
export const useWellFieldRef = () => useContext(WellFieldContext);

export type WellDropState = "accepts" | "rejects" | "over";

type SummaryWellProps = {
  wellId: SummaryWellId;
  title: string;
  dropState: WellDropState | null;
  action?: ReactNode;
  /** The well's typeahead field, for a caller that focuses it from outside the well. */
  fieldRef?: RefObject<HTMLInputElement | null>;
  /** Takes the focus when the well goes away while the focus is in it. */
  focusFallbackRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export function SummaryWell({
  wellId,
  title,
  dropState,
  action,
  fieldRef: externalFieldRef,
  focusFallbackRef,
  children,
}: SummaryWellProps) {
  const ownFieldRef = useRef<HTMLInputElement>(null);
  const fieldRef = externalFieldRef ?? ownFieldRef;
  const {
    setNodeRef,
    node: cardRef,
    isOver,
  } = useDroppable({
    id: `well:${wellId}`,
    data: { wellId },
  });
  const effectiveDropState =
    dropState === "accepts" && isOver ? "over" : dropState;
  useFocusFallback(cardRef, focusFallbackRef);

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof Element) ||
      event.target.closest(INTERACTIVE_SELECTOR)
    ) {
      return;
    }
    const field = fieldRef.current;
    if (field) {
      // keep the mousedown from blurring the field we're about to focus
      event.preventDefault();
      field.focus();
    }
  };

  return (
    <WellFieldContext.Provider value={fieldRef}>
      <Card
        ref={setNodeRef}
        className={S.well}
        radius="lg"
        shadow="xs_outline"
        p="md"
        data-testid={`summary-well-${wellId}`}
        data-drop={effectiveDropState ?? undefined}
        onMouseDown={handleMouseDown}
      >
        <Flex className={S.wellHeader}>
          <Text className={S.wellTitle}>{title}</Text>
          {action}
        </Flex>
        {children}
      </Card>
    </WellFieldContext.Provider>
  );
}
