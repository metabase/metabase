import { useMergedRef } from "@mantine/hooks";
import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  type ReactNode,
  type MouseEvent,
} from "react";
import { t } from "ttag";
import _ from "underscore";

import { QueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import { HoverParent } from "metabase/components/MetadataInfo/InfoIcon";
import { Popover as InfoPopover } from "metabase/components/MetadataInfo/Popover";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { isObscured } from "metabase/lib/dom";
import {
  DelayGroup,
  Icon,
  type IconName,
  Popover,
  DEFAULT_POPOVER_Z_INDEX,
} from "metabase/ui";
import type * as Lib from "metabase-lib";
import type {
  Suggestion,
  GroupName,
} from "metabase-lib/v1/expressions/suggest";
import { GROUPS } from "metabase-lib/v1/expressions/suggest";

import { ExpressionEditorHelpTextContent } from "../ExpressionEditorHelpText";
import type {
  SuggestionFooter,
  SuggestionShortcut,
} from "../ExpressionEditorTextfield";

import {
  ExpressionListItem,
  ExpressionListFooter,
  ExpressionList,
  SuggestionMatch,
  SuggestionTitle,
  GroupTitle,
  PopoverHoverTarget,
} from "./ExpressionEditorSuggestions.styled";

type WithIndex<T> = T & {
  index: number;
};

export const ExpressionEditorSuggestions = forwardRef<
  HTMLUListElement,
  {
    query: Lib.Query;
    stageIndex: number;
    suggestions?: (Suggestion | SuggestionFooter | SuggestionShortcut)[];
    onSuggestionMouseDown: (index: number) => void;
    open: boolean;
    highlightedIndex: number;
    onHighlightSuggestion: (index: number) => void;
    children: ReactNode;
  }
>(function ExpressionEditorSuggestions(
  {
    query,
    stageIndex,
    suggestions = [],
    onSuggestionMouseDown,
    open,
    highlightedIndex,
    onHighlightSuggestion,
    children,
  },
  ref,
) {
  const listRef = useRef(null);
  const mergedRef = useMergedRef(ref, listRef);
  const withIndex = suggestions.map((suggestion, index) => ({
    ...suggestion,
    index,
  }));

  const items = withIndex.filter(
    (suggestion): suggestion is WithIndex<Suggestion> =>
      !("footer" in suggestion),
  );

  const footers = withIndex.filter(
    (suggestion): suggestion is WithIndex<SuggestionFooter> =>
      "footer" in suggestion,
  );

  const groups = group(items);

  function handleMouseDown(evt: MouseEvent) {
    if (evt.target === listRef.current) {
      evt.preventDefault();
      evt.stopPropagation();
    }
  }

  return (
    <Popover
      position="bottom-start"
      opened={open && suggestions.length > 0}
      radius="xs"
      withinPortal
      zIndex={DEFAULT_POPOVER_Z_INDEX}
      middlewares={{
        flip: false,
        shift: false,
        inline: false,
      }}
    >
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown>
        <DelayGroup>
          <ExpressionList
            data-testid="expression-suggestions-list"
            ref={mergedRef}
            onMouseDownCapture={handleMouseDown}
          >
            <ExpressionEditorSuggestionsListGroup
              suggestions={groups._none}
              query={query}
              stageIndex={stageIndex}
              highlightedIndex={highlightedIndex}
              onSuggestionMouseDown={onSuggestionMouseDown}
              onHighlightSuggestion={onHighlightSuggestion}
            />
            <ExpressionEditorSuggestionsListGroup
              name="popularAggregations"
              suggestions={groups.popularAggregations}
              query={query}
              stageIndex={stageIndex}
              highlightedIndex={highlightedIndex}
              onSuggestionMouseDown={onSuggestionMouseDown}
              onHighlightSuggestion={onHighlightSuggestion}
            />
            <ExpressionEditorSuggestionsListGroup
              name="popularExpressions"
              suggestions={groups.popularExpressions}
              query={query}
              stageIndex={stageIndex}
              highlightedIndex={highlightedIndex}
              onSuggestionMouseDown={onSuggestionMouseDown}
              onHighlightSuggestion={onHighlightSuggestion}
            />
            <ExpressionEditorSuggestionsListGroup
              name="shortcuts"
              suggestions={groups.shortcuts}
              query={query}
              stageIndex={stageIndex}
              highlightedIndex={highlightedIndex}
              onSuggestionMouseDown={onSuggestionMouseDown}
              onHighlightSuggestion={onHighlightSuggestion}
            />
          </ExpressionList>
          {footers.map(suggestion => (
            <Footer
              key={suggestion.index}
              suggestion={suggestion}
              highlightedIndex={highlightedIndex}
              onHighlightSuggestion={onHighlightSuggestion}
            />
          ))}
        </DelayGroup>
      </Popover.Dropdown>
    </Popover>
  );
});

function ExpressionEditorSuggestionsListGroup({
  name,
  query,
  stageIndex,
  suggestions = [],
  onSuggestionMouseDown,
  onHighlightSuggestion,
  highlightedIndex,
}: {
  name?: GroupName;
  query: Lib.Query;
  stageIndex: number;
  suggestions?: Suggestion[];
  onSuggestionMouseDown: (index: number) => void;
  onHighlightSuggestion: (index: number) => void;
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
          key={`suggestion-${suggestion.index}`}
          query={query}
          stageIndex={stageIndex}
          suggestion={suggestion}
          isHighlighted={suggestion.index === highlightedIndex}
          index={suggestion.index}
          onMouseDown={onSuggestionMouseDown}
          onHighlightSuggestion={onHighlightSuggestion}
        />
      ))}
    </>
  );
}

function ExpressionEditorSuggestionsListItem({
  query,
  stageIndex,
  suggestion,
  onHighlightSuggestion,
  isHighlighted,
  onMouseDown,
  index,
}: {
  query: Lib.Query;
  stageIndex: number;
  index: number;
  isHighlighted: boolean;
  onMouseDown: (index: number) => void;
  onHighlightSuggestion: (index: number) => void;
  suggestion: Suggestion;
}) {
  const { icon, helpText, range = [] } = suggestion;
  const [start = 0, end = 0] = range;

  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!isHighlighted || !ref.current || !isObscured(ref.current)) {
      return;
    }

    ref.current.scrollIntoView({ block: "nearest" });
  }, [isHighlighted]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onMouseDown?.(index);
    },
    [index, onMouseDown],
  );

  const handleMouseMove = useCallback(() => {
    onHighlightSuggestion(index);
  }, [index, onHighlightSuggestion]);

  return (
    <HoverParent as="li">
      <ExpressionListItem
        as="div"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        ref={ref}
        isHighlighted={isHighlighted}
        data-testid="expression-suggestions-list-item"
      >
        {icon && (helpText || !suggestion.column) && (
          <Icon
            name={icon as IconName}
            color={isHighlighted ? color("brand-white") : color("text-light")}
            className={CS.mr1}
          />
        )}
        {!helpText && suggestion.column && (
          <QueryColumnInfoIcon
            query={query}
            stageIndex={stageIndex}
            column={suggestion.column}
            position="top-start"
            color={isHighlighted ? color("brand-white") : color("text-light")}
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
      </ExpressionListItem>
    </HoverParent>
  );
}

function Footer({
  suggestion,
  highlightedIndex,
  onHighlightSuggestion,
}: {
  suggestion: WithIndex<SuggestionFooter>;
  highlightedIndex: number;
  onHighlightSuggestion: (index: number) => void;
}) {
  function handleMouseDownCapture(evt: MouseEvent) {
    // prevent the dropdown from closing
    evt.preventDefault();
  }

  const handleMouseMove = useCallback(() => {
    if (suggestion.index !== highlightedIndex) {
      onHighlightSuggestion(suggestion.index);
    }
  }, [suggestion.index, onHighlightSuggestion, highlightedIndex]);

  const isHighlighted = highlightedIndex === suggestion.index;

  return (
    <ExpressionListFooter
      target="_blank"
      href={suggestion.href}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseMove={handleMouseMove}
      isHighlighted={isHighlighted}
      data-testid="expression-suggestions-list-item"
    >
      <Icon
        name="reference"
        color={isHighlighted ? color("brand-white") : color("text-light")}
        className={CS.mr1}
      />
      <SuggestionTitle>{suggestion.name}</SuggestionTitle>
    </ExpressionListFooter>
  );
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
    shortcuts: [],
  };

  suggestions.forEach(suggestion => {
    if (suggestion.group) {
      groups[suggestion.group].push(suggestion);
    } else {
      groups._none.push(suggestion);
    }
  });

  return groups;
}
