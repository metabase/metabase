import cx from "classnames";
import { type ReactNode, type RefObject, useMemo } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import { getColumnGroupIcon } from "metabase/common/utils/column-groups";
import { DelayGroup, Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  CLOSE_PAREN,
  OPEN_PAREN,
  type Token,
  opToken,
} from "../expression-bar-2/tokens";

import S from "./ExpressionBar.module.css";

const WIDTH = 300;
const MAX_HEIGHT = 420;

type LogicKeyword = {
  label: string;
  token: Token;
  /** What typing can spell on the way to this keyword. */
  spellings: string[];
};

const LOGIC_KEYWORDS: LogicKeyword[] = [
  { label: "AND", token: opToken("and"), spellings: ["and", "&&"] },
  { label: "OR", token: opToken("or"), spellings: ["or", "||"] },
  { label: "(", token: OPEN_PAREN, spellings: ["("] },
  { label: ")", token: CLOSE_PAREN, spellings: [")"] },
];

/** The keyword the typed text is on its way to, if any. */
export function matchLogic(text: string): LogicKeyword | undefined {
  const word = text.trim().toLowerCase();
  return word.length === 0
    ? undefined
    : LOGIC_KEYWORDS.find(({ spellings }) =>
        spellings.some((spelling) => spelling.startsWith(word)),
      );
}

type ColumnItem = {
  column: Lib.ColumnMetadata;
  name: string;
  displayName: string;
  longDisplayName: string;
};

const SEARCH_PROP = ["name", "displayName", "longDisplayName"] as const;

type LogicColumnListProps = {
  listRef: RefObject<HTMLDivElement | null>;
  query: Lib.Query;
  stageIndex: number;
  text: string;
  isLogicHighlightable: boolean;
  onFocusSteal: () => void;
  onPickToken: (token: Token) => void;
  onPickColumn: (column: Lib.ColumnMetadata) => void;
};

/**
 * The app's filter column list (same AccordionList, icons and groups) with
 * the logic keywords in one row on top. The list's own search box is hidden:
 * the bar's text is fed into it, and focus goes back to the bar whenever the
 * list grabs it.
 */
export function LogicColumnList({
  listRef,
  query,
  stageIndex,
  text,
  isLogicHighlightable,
  onFocusSteal,
  onPickToken,
  onPickColumn,
}: LogicColumnListProps) {
  const match = matchLogic(text);
  const isLogicVisible = text.trim().length === 0 || match != null;

  const sections = useMemo(
    () =>
      Lib.groupColumns(Lib.filterableColumns(query, stageIndex)).map(
        (group): Section<ColumnItem> => {
          const groupInfo = Lib.displayInfo(query, stageIndex, group);
          return {
            name: groupInfo.displayName,
            icon: getColumnGroupIcon(groupInfo),
            items: Lib.getColumnsFromColumnGroup(group).map((column) => {
              const info = Lib.displayInfo(query, stageIndex, column);
              return {
                column,
                name: info.name,
                displayName: info.displayName,
                longDisplayName: info.longDisplayName,
              };
            }),
          };
        },
      ),
    [query, stageIndex],
  );

  return (
    <div
      ref={listRef}
      className={S.columnList}
      onFocusCapture={() => setTimeout(onFocusSteal)}
      // Clicks pick items without moving focus out of the bar.
      onMouseDownCapture={(event) => event.preventDefault()}
    >
      {isLogicVisible && (
        <Group gap="xs" px="md" py="sm" className={S.logicRow}>
          <Text size="sm" fw="bold" c="text-secondary" mr="auto">
            {t`Logic`}
          </Text>
          {LOGIC_KEYWORDS.map((keyword) => (
            <button
              key={keyword.label}
              type="button"
              className={cx(S.logicKeyword, {
                [S.logicKeywordOr]: keyword.label === "OR",
                [S.logicKeywordParen]: keyword.token.type === "paren",
                [S.logicKeywordActive]:
                  isLogicHighlightable && keyword === match,
              })}
              onClick={() => onPickToken(keyword.token)}
            >
              {keyword.label}
            </button>
          ))}
        </Group>
      )}
      <DelayGroup>
        <AccordionList<ColumnItem>
          className={S.list}
          sections={sections}
          onChange={(item) => onPickColumn(item.column)}
          renderItemWrapper={renderItemWrapper}
          renderItemDescription={() => undefined}
          renderItemIcon={(item) => (
            <QueryColumnInfoIcon
              query={query}
              stageIndex={stageIndex}
              column={item.column}
              position="top-start"
              size={18}
            />
          )}
          width={WIDTH}
          maxHeight={MAX_HEIGHT}
          searchProp={SEARCH_PROP}
          alwaysExpanded
          globalSearch
        />
      </DelayGroup>
    </div>
  );
}

function renderItemWrapper(content: ReactNode) {
  return <HoverParent>{content}</HoverParent>;
}
