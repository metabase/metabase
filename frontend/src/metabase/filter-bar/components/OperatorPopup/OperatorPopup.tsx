import { type Ref, useMemo } from "react";

import type { BareSuggestionRendererRef } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";
import { Menu } from "metabase/ui";

import type { FilterOperator } from "../../types";
import type { GetAnchorRect } from "../AnchorTarget/AnchorTarget";
import { getOperatorText } from "../OperatorPart/utils";
import {
  SuggestionMenu,
  SuggestionSection,
} from "../SuggestionMenu/SuggestionMenu";
import { useSuggestionKeys } from "../SuggestionMenu/use-suggestion-keys";

import { findExactOperator, findOperators } from "./utils";

type OperatorPopupProps = {
  operators: readonly FilterOperator[];
  query: string;
  getAnchorRect: GetAnchorRect;
  handle: Ref<BareSuggestionRendererRef>;
  onPick: (operator: FilterOperator) => void;
};

export const OperatorPopup = ({
  operators,
  query,
  getAnchorRect,
  handle,
  onPick,
}: OperatorPopupProps) => {
  const items = useMemo(
    () => findOperators(operators, query),
    [operators, query],
  );
  const { activeIndex, setActiveIndex } = useSuggestionKeys({
    handle,
    query,
    isEmpty: items.length === 0,
    firstIndex: 0,
    getNextIndex: (index, step) => (index + step + items.length) % items.length,
    pickActive: (index) => {
      const operator = items.at(index);
      if (operator) {
        onPick(operator);
      }
      return operator !== undefined;
    },
    pickExact: () => {
      const operator = findExactOperator(operators, query);
      if (operator) {
        onPick(operator);
      }
      return operator !== null;
    },
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <SuggestionMenu getAnchorRect={getAnchorRect}>
      <SuggestionSection>
        {items.map((operator, index) => (
          <Menu.Item
            key={operator.key}
            aria-selected={index === activeIndex}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => onPick(operator)}
          >
            {getOperatorText(operator)}
          </Menu.Item>
        ))}
      </SuggestionSection>
    </SuggestionMenu>
  );
};
