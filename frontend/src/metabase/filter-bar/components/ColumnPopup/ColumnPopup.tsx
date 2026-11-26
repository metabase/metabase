import { type Ref, useMemo, useState } from "react";

import type { BareSuggestionRendererRef } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";
import { Menu } from "metabase/ui";

import type { ConnectorToken } from "../../model";
import type { ColumnGroup, ColumnItem } from "../../types";
import type { GetAnchorRect } from "../AnchorTarget/AnchorTarget";
import { LogicOperatorsHint } from "../LogicOperatorsHint/LogicOperatorsHint";
import {
  SuggestionMenu,
  SuggestionSection,
} from "../SuggestionMenu/SuggestionMenu";
import { useSuggestionKeys } from "../SuggestionMenu/use-suggestion-keys";

import { ColumnRow } from "./ColumnRow/ColumnRow";
import {
  type ListRow,
  buildList,
  findExactItem,
  getFirstItemIndex,
  getNextIndex,
  splitByGroup,
} from "./utils";

type ColumnPopupProps<F> = {
  groups: readonly ColumnGroup<F>[];
  query: string;
  getAnchorRect: GetAnchorRect;
  handle: Ref<BareSuggestionRendererRef>;
  connector: ConnectorToken["type"] | null;
  onPick: (item: ColumnItem<F>) => void;
  onPickConnector: (connector: ConnectorToken["type"]) => void;
};

export const ColumnPopup = <F,>({
  groups,
  query,
  getAnchorRect,
  handle,
  connector,
  onPick,
  onPickConnector,
}: ColumnPopupProps<F>) => {
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const rows = useMemo(
    () => buildList(groups, query, collapsedKeys),
    [groups, query, collapsedKeys],
  );
  const toggle = (key: string) => {
    const next = new Set(collapsedKeys);
    if (!next.delete(key)) {
      next.add(key);
    }
    setCollapsedKeys(next);
  };

  const pick = (row: ListRow<F> | undefined) => {
    if (row?.type === "group") {
      toggle(row.key);
    }
    if (row?.type === "item") {
      onPick(row.item);
    }
  };

  const { activeIndex, setActiveIndex } = useSuggestionKeys({
    handle,
    query,
    isEmpty: rows.length === 0 && connector === null,
    firstIndex: connector ? -1 : getFirstItemIndex(rows),
    getNextIndex: (index, step) => getNextIndex(rows, index, step),
    pickActive: (index) => {
      if (connector && index < 0) {
        onPickConnector(connector);
        return true;
      }
      pick(rows[index]);
      return index >= 0;
    },
    pickExact: () => {
      const item = connector ? null : findExactItem(rows, query);
      if (item) {
        onPick(item);
      }
      return item !== null;
    },
  });

  if (rows.length === 0 && !connector) {
    return null;
  }

  return (
    <SuggestionMenu
      getAnchorRect={getAnchorRect}
      footer={<LogicOperatorsHint />}
    >
      {connector && (
        <SuggestionSection>
          <Menu.Item
            aria-selected={activeIndex < 0}
            onMouseEnter={() => setActiveIndex(-1)}
            onClick={() => onPickConnector(connector)}
          >
            {connector.toUpperCase()}
          </Menu.Item>
        </SuggestionSection>
      )}
      {splitByGroup(rows).map((section) => (
        <SuggestionSection
          key={section.rows[0].key}
          isCollapsed={section.isCollapsed}
        >
          {section.rows.map((row, offset) => (
            <ColumnRow
              key={row.key}
              row={row}
              isActive={section.start + offset === activeIndex}
              onHover={() => setActiveIndex(section.start + offset)}
              onClick={() => pick(row)}
            />
          ))}
        </SuggestionSection>
      ))}
    </SuggestionMenu>
  );
};
