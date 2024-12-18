import { useMergedRef } from "@mantine/hooks";
import cx from "classnames";
import {
  type MouseEvent,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { t } from "ttag";

import { QueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import {
  HoverParent,
  PopoverHoverTarget,
} from "metabase/components/MetadataInfo/InfoIcon";
import { Popover as InfoPopover } from "metabase/components/MetadataInfo/Popover";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { isObscured } from "metabase/lib/dom";
import {
  Box,
  DelayGroup,
  Flex,
  Icon,
  type IconName,
  Popover,
} from "metabase/ui";
import type * as Lib from "metabase-lib";
import type {
  GroupName,
  Suggestion,
} from "metabase-lib/v1/expressions/suggest";
import { GROUPS } from "metabase-lib/v1/expressions/suggest";

import { ExpressionEditorHelpTextContent } from "../ExpressionEditorHelpText";
import type {
  SuggestionFooter,
  SuggestionShortcut,
} from "../ExpressionEditorTextfield";

import ExpressionEditorSuggestionsS from "./ExpressionEditorSuggestions.module.css";

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
      middlewares={{
        flip: false,
        shift: false,
        inline: false,
      }}
    >
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown>
        <DelayGroup>
          <Box
            component="ul"
            miw={250}
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
          </Box>
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
        <Box
          component="li"
          className={cx(
            ExpressionEditorSuggestionsS.ExpressionListItem,
            ExpressionEditorSuggestionsS.GroupTitle,
          )}
        >
          {definition.displayName}
        </Box>
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

  const ref = useRef<HTMLDivElement>(null);
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
      <Flex
        className={cx(ExpressionEditorSuggestionsS.ExpressionListItem, {
          [ExpressionEditorSuggestionsS.isHighlighted]: isHighlighted,
        })}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        ref={ref}
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
        <Box mr="1.5rem" component="span">
          {suggestion.name.slice(0, start)}
          <Box component="span" fw="bold">
            {suggestion.name.slice(start, end)}
          </Box>
          {suggestion.name.slice(end)}
        </Box>
        {helpText && (
          <InfoPopover
            position="right"
            content={<ExpressionEditorHelpTextContent helpText={helpText} />}
            width={450}
          >
            <PopoverHoverTarget
              className={ExpressionEditorSuggestionsS.PopoverHoverTarget}
              name="info_filled"
              aria-label={t`More info`}
            />
          </InfoPopover>
        )}
      </Flex>
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
    <Box
      component="a"
      className={cx(ExpressionEditorSuggestionsS.ExpressionListFooter, {
        [ExpressionEditorSuggestionsS.isHighlighted]: isHighlighted,
      })}
      target="_blank"
      href={suggestion.href}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseMove={handleMouseMove}
      data-testid="expression-suggestions-list-item"
    >
      <Icon
        name="reference"
        color={isHighlighted ? color("brand-white") : color("text-light")}
        className={CS.mr1}
      />
      <Box mr="1.5rem" component="span">
        {suggestion.name}
      </Box>
    </Box>
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
