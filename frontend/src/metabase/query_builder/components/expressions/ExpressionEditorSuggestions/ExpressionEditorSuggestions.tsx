import cx from "classnames";
import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { t } from "ttag";
import _ from "underscore";

import { HoverParent } from "metabase/components/MetadataInfo/InfoIcon";
import { Popover as InfoPopover } from "metabase/components/MetadataInfo/Popover";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { isObscured } from "metabase/lib/dom";
import { DelayGroup, Icon, type IconName, Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Suggestion } from "metabase-lib/v1/expressions/suggest";

import { ExpressionEditorHelpTextContent } from "../ExpressionEditorHelpText";

import {
  ExpressionListItem,
  ExpressionList,
  SuggestionMatch,
  SuggestionTitle,
  QueryColumnInfoIcon,
  PopoverHoverTarget,
} from "./ExpressionEditorSuggestions.styled";

export function ExpressionEditorSuggestions({
  query,
  stageIndex,
  suggestions = [],
  onSuggestionMouseDown,
  highlightedIndex,
  children,
}: {
  query: Lib.Query;
  stageIndex: number;
  suggestions?: Suggestion[];
  onSuggestionMouseDown: (index: number) => void;
  highlightedIndex: number;
  children: ReactNode;
}) {
  return (
    <Popover
      position="bottom-start"
      opened={suggestions?.length > 0}
      radius="xs"
      withinPortal
      zIndex={300}
      returnFocus
    >
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown>
        <DelayGroup>
          <ExpressionList
            data-testid="expression-suggestions-list"
            className={CS.pb1}
          >
            {suggestions.map((suggestion: Suggestion, idx: number) => (
              <ExpressionEditorSuggestionsListItem
                key={`suggesion-${idx}`}
                query={query}
                stageIndex={stageIndex}
                suggestion={suggestion}
                isHighlighted={idx === highlightedIndex}
                index={idx}
                onMouseDown={onSuggestionMouseDown}
              />
            ))}
          </ExpressionList>
        </DelayGroup>
      </Popover.Dropdown>
    </Popover>
  );
}

function ExpressionEditorSuggestionsListItem({
  query,
  stageIndex,
  suggestion,
  isHighlighted,
  onMouseDown,
  index,
}: {
  query: Lib.Query;
  stageIndex: number;
  index: number;
  isHighlighted: boolean;
  onMouseDown: (index: number) => void;
  suggestion: Suggestion;
}) {
  const { icon, helpText, name, range = [] } = suggestion;
  const [start = 0, end = name.length - 1] = range;

  const { normal, highlighted } = colorForIcon(icon);

  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!isHighlighted || !ref.current || !isObscured(ref.current)) {
      return;
    }

    ref.current.scrollIntoView({ block: "nearest" });
  }, [isHighlighted]);

  const handleMouseDown = useCallback(
    function (event: React.MouseEvent) {
      event.preventDefault();
      event.stopPropagation();
      onMouseDown?.(index);
    },
    [index, onMouseDown],
  );

  return (
    <HoverParent>
      <ExpressionListItem
        onMouseDown={handleMouseDown}
        ref={ref}
        isHighlighted={isHighlighted}
        className={cx(CS.hoverParent, CS.hoverInherit)}
        data-testid="expression-suggestions-list-item"
      >
        {icon && (
          <Icon
            name={icon as IconName}
            color={isHighlighted ? highlighted : normal}
            className={CS.mr1}
          />
        )}
        <SuggestionTitle>
          {suggestion.name.slice(0, start)}
          <SuggestionMatch>{suggestion.name.slice(start, end)}</SuggestionMatch>
          {suggestion.name.slice(end)}
        </SuggestionTitle>
        {helpText && (
          <InfoPopover
            position="right"
            content={<ExpressionEditorHelpTextContent helpText={helpText} />}
            width={450}
          >
            <PopoverHoverTarget
              name="info_filled"
              hasDescription
              aria-label={t`More info`}
            />
          </InfoPopover>
        )}
        {!helpText && suggestion.column && (
          <QueryColumnInfoIcon
            query={query}
            stageIndex={stageIndex}
            column={suggestion.column}
            position="right"
          />
        )}
      </ExpressionListItem>
    </HoverParent>
  );
}

function colorForIcon(icon: string | undefined | null) {
  switch (icon) {
    case "segment":
      return { normal: color("accent2"), highlighted: color("brand-white") };
    case "insight":
      return { normal: color("accent1"), highlighted: color("brand-white") };
    case "function":
      return { normal: color("brand"), highlighted: color("brand-white") };
    default:
      return {
        normal: color("text-medium"),
        highlighted: color("brand-white"),
      };
  }
}
