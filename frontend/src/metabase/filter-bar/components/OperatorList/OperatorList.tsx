import { type Ref, useMemo } from "react";

import { Combobox, useCombobox } from "metabase/ui";

import type { FilterOperator, FilterOperatorGroup } from "../../types";
import { getOperatorText } from "../OperatorPart/utils";
import {
  type ListKeys,
  SuggestionList,
  SuggestionSection,
  useListKeys,
} from "../SuggestionList/SuggestionList";

import { findExactOperator, findOperatorGroups } from "./utils";

type OperatorListProps = {
  groups: readonly FilterOperatorGroup[];
  query: string;
  keys: Ref<ListKeys>;
  onPick: (operator: FilterOperator) => void;
};

export const OperatorList = ({
  groups,
  query,
  keys,
  onPick,
}: OperatorListProps) => {
  const store = useCombobox();
  const foundGroups = useMemo(
    () => findOperatorGroups(groups, query),
    [groups, query],
  );
  const operators = foundGroups.flat();

  const submit = (value: string) => {
    const operator = operators.find(({ key }) => key === value);
    if (operator) {
      onPick(operator);
    }
  };

  useListKeys({
    keys,
    store,
    query,
    firstIndex: 0,
    pickExact: () => {
      const operator = findExactOperator(groups.flat(), query);
      if (operator) {
        onPick(operator);
      }
      return operator !== null;
    },
  });

  return (
    <SuggestionList store={store} onSubmit={submit}>
      {foundGroups.map((group) => (
        <SuggestionSection key={group[0].key}>
          {group.map((operator) => (
            <Combobox.Option
              key={operator.key}
              value={operator.key}
              onMouseEnter={() =>
                store.selectOption(operators.indexOf(operator))
              }
            >
              {getOperatorText(operator)}
            </Combobox.Option>
          ))}
        </SuggestionSection>
      ))}
    </SuggestionList>
  );
};
