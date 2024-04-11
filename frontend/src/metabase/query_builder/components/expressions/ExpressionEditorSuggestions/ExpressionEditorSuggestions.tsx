import cx from "classnames";
import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type MouseEvent,
} from "react";
import { t } from "ttag";
import _ from "underscore";

import { HoverParent } from "metabase/components/MetadataInfo/InfoIcon";
import { Popover as InfoPopover } from "metabase/components/MetadataInfo/Popover";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { isObscured } from "metabase/lib/dom";
import { DelayGroup, Icon, type IconName, Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type {
  Suggestion,
  GroupName,
} from "metabase-lib/v1/expressions/suggest";
import { GROUPS } from "metabase-lib/v1/expressions/suggest";

import { ExpressionEditorHelpTextContent } from "../ExpressionEditorHelpText";
import type { SuggestionFooter } from "../ExpressionEditorTextfield";

import {
  ExpressionListItem,
  ExpressionListFooter,
  ExternalIcon,
  ExpressionList,
  SuggestionMatch,
  SuggestionTitle,
  GroupTitle,
  QueryColumnInfoIcon,
  PopoverHoverTarget,
} from "./ExpressionEditorSuggestions.styled";

type WithIndex<T> = T & {
  index: number;
};

export function ExpressionEditorSuggestions({
  query,
  stageIndex,
  suggestions: _suggestions = [],
  onSuggestionMouseDown,
  highlightedIndex,
  children,
}: {
  query: Lib.Query;
  stageIndex: number;
  suggestions?: (Suggestion | SuggestionFooter)[];
  onSuggestionMouseDown: (index: number) => void;
  highlightedIndex: number;
  children: ReactNode;
}) {
  const withIndex = _suggestions.map((suggestion, index) => ({
    ...suggestion,
    index,
  }));

  const suggestions = withIndex.filter(
    (suggestion): suggestion is WithIndex<Suggestion> =>
      !("footer" in suggestion),
  );

  const footers = withIndex.filter(
    (suggestion): suggestion is WithIndex<SuggestionFooter> =>
      "footer" in suggestion,
  );

  const groups = group(suggestions);

  return (
    <Popover
      position="bottom-start"
      opened={suggestions.length > 0}
      radius="xs"
      withinPortal
      zIndex={300}
    >
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown>
        <DelayGroup>
          <ExpressionList data-testid="expression-suggestions-list">
            <ExpressionEditorSuggestionsListGroup
              suggestions={groups._none}
              query={query}
              stageIndex={stageIndex}
              highlightedIndex={highlightedIndex}
              onSuggestionMouseDown={onSuggestionMouseDown}
            />
            <ExpressionEditorSuggestionsListGroup
              name="popularAggregations"
              suggestions={groups.popularAggregations}
              query={query}
              stageIndex={stageIndex}
              highlightedIndex={highlightedIndex}
              onSuggestionMouseDown={onSuggestionMouseDown}
            />
            <ExpressionEditorSuggestionsListGroup
              name="popularExpressions"
              suggestions={groups.popularExpressions}
              query={query}
              stageIndex={stageIndex}
              highlightedIndex={highlightedIndex}
              onSuggestionMouseDown={onSuggestionMouseDown}
            />
          </ExpressionList>
        </DelayGroup>
        {footers.map(suggestion => (
          <Footer
            key={suggestion.index}
            suggestion={suggestion}
            highlightedIndex={highlightedIndex}
          />
        ))}
      </Popover.Dropdown>
    </Popover>
  );
}

function ExpressionEditorSuggestionsListGroup({
  name,
  query,
  stageIndex,
  suggestions = [],
  onSuggestionMouseDown,
  highlightedIndex,
}: {
  name?: GroupName;
  query: Lib.Query;
  stageIndex: number;
  suggestions?: Suggestion[];
  onSuggestionMouseDown: (index: number) => void;
  highlightedIndex: number;
}) {
  const definition = name && GROUPS[name];

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <>
      {definition?.displayName && (
        <GroupTitle isHighlighted={false}>{definition.displayName}</GroupTitle>
      )}
      {suggestions.map((suggestion: SuggestionWithIndex) => (
        <ExpressionEditorSuggestionsListItem
          key={`suggesion-${suggestion.index}`}
          query={query}
          stageIndex={stageIndex}
          suggestion={suggestion}
          isHighlighted={suggestion.index === highlightedIndex}
          index={suggestion.index}
          onMouseDown={onSuggestionMouseDown}
        />
      ))}
    </>
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
  const { icon, helpText, range = [] } = suggestion;
  const [start = 0, end = 0] = range;

  const { normal, highlighted } = colorForIcon(icon);

  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!isHighlighted || !ref.current || !isObscured(ref.current)) {
      return;
    }

    ref.current.scrollIntoView({ block: "nearest" });
  }, [isHighlighted]);

  const handleMouseDown = useCallback(
    function (event) {
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

function Footer({
  suggestion,
  highlightedIndex,
}: {
  suggestion: WithIndex<SuggestionFooter>;
  highlightedIndex: number;
}) {
  function handleMouseDownCapture(evt: MouseEvent) {
    // prevent the dropdown from closing
    evt.preventDefault();
  }

  return (
    <ExpressionListFooter
      target="blank"
      href={suggestion.href}
      onMouseDownCapture={handleMouseDownCapture}
      isHighlighted={highlightedIndex === suggestion.index}
    >
      {suggestion.name} <ExternalIcon name={suggestion.icon} />
    </ExpressionListFooter>
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

type SuggestionWithIndex = Suggestion & {
  index: number;
};

type Groups = {
  [key in GroupName | "_none"]: SuggestionWithIndex[];
};

function group(suggestions: Suggestion[]): Groups {
  const groups: Groups = {
    _none: [],
    popularAggregations: [],
    popularExpressions: [],
  };

  suggestions.forEach(function (suggestion) {
    if (suggestion.group) {
      groups[suggestion.group] ??= [];
      groups[suggestion.group].push(suggestion);
    } else {
      groups._none.push(suggestion);
    }
  });

  return groups;
}
