import { type Ref, useMemo, useState } from "react";

import { Combobox, useCombobox } from "metabase/ui";

import type { ConnectorToken } from "../../model";
import type { ColumnGroup, ColumnItem } from "../../types";
import { LogicOperatorsHint } from "../LogicOperatorsHint/LogicOperatorsHint";
import {
  type ListKeys,
  SuggestionList,
  SuggestionSection,
  useListKeys,
} from "../SuggestionList/SuggestionList";

import { ColumnRow } from "./ColumnRow/ColumnRow";
import {
  buildList,
  findExactItem,
  getFirstItemOptionIndex,
  getOptionRows,
  splitByGroup,
} from "./utils";

const CONNECTOR_VALUE = "connector";

type ColumnListProps<F> = {
  groups: readonly ColumnGroup<F>[];
  query: string;
  keys: Ref<ListKeys>;
  connector: ConnectorToken["type"] | null;
  onPick: (item: ColumnItem<F>) => void;
  onPickConnector: (connector: ConnectorToken["type"]) => void;
};

export const ColumnList = <F,>({
  groups,
  query,
  keys,
  connector,
  onPick,
  onPickConnector,
}: ColumnListProps<F>) => {
  const store = useCombobox();
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const rows = useMemo(
    () => buildList(groups, query, collapsedKeys),
    [groups, query, collapsedKeys],
  );
  const optionRows = getOptionRows(rows);
  const optionOffset = connector ? 1 : 0;

  const toggle = (key: string) => {
    const next = new Set(collapsedKeys);
    if (!next.delete(key)) {
      next.add(key);
    }
    setCollapsedKeys(next);
  };

  const submit = (value: string) => {
    const row = rows.find(({ key }) => key === value);
    if (connector && value === CONNECTOR_VALUE) {
      onPickConnector(connector);
    }
    if (row?.type === "group") {
      toggle(row.key);
    }
    if (row?.type === "item") {
      onPick(row.item);
    }
  };

  useListKeys({
    keys,
    store,
    query,
    firstIndex: connector ? 0 : getFirstItemOptionIndex(rows),
    pickExact: () => {
      const item = connector ? null : findExactItem(rows, query);
      if (item) {
        onPick(item);
      }
      return item !== null;
    },
  });

  return (
    <SuggestionList
      store={store}
      footer={<LogicOperatorsHint />}
      onSubmit={submit}
    >
      {connector && (
        <SuggestionSection>
          <Combobox.Option
            value={CONNECTOR_VALUE}
            onMouseEnter={() => store.selectOption(0)}
          >
            {connector.toUpperCase()}
          </Combobox.Option>
        </SuggestionSection>
      )}
      {splitByGroup(rows).map((section) => (
        <SuggestionSection
          key={section.rows[0].key}
          isExpandedGroup={!section.isCollapsed}
        >
          {section.rows.map((row) => (
            <ColumnRow
              key={row.key}
              row={row}
              onHover={() =>
                store.selectOption(
                  optionRows.findIndex(({ key }) => key === row.key) +
                    optionOffset,
                )
              }
            />
          ))}
        </SuggestionSection>
      ))}
    </SuggestionList>
  );
};
