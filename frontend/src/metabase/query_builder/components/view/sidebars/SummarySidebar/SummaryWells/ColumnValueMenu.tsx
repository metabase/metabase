import type { MouseEvent } from "react";
import { t } from "ttag";

import { Ellipsified, Icon, Menu, UnstyledButton } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "../SummarySidebar.module.css";
import type { SummaryValueItem } from "../types";
import { changeValueOperator } from "../utils";

import { useWellFieldRef } from "./SummaryWell";

type ColumnValueMenuProps = {
  query: Lib.Query;
  stageIndex: number;
  item: Extract<SummaryValueItem, { kind: "column" }>;
  /** False when the chip shows the label on its own, leaving the menu its chevron. */
  hasLabel?: boolean;
  onChange: (nextQuery: Lib.Query) => void;
};

export function ColumnValueMenu({
  query,
  stageIndex,
  item,
  hasLabel = true,
  onChange,
}: ColumnValueMenuProps) {
  const wellFieldRef = useWellFieldRef();

  const handleSelect = (
    operator: Lib.AggregationOperator,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const isKeyboardClick = event.detail === 0;
    onChange(changeValueOperator(query, stageIndex, item, operator));
    if (isKeyboardClick) {
      wellFieldRef?.current?.focus();
    }
  };

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <UnstyledButton
          className={S.chipButton}
          aria-label={t`Change how ${item.label} is calculated`}
        >
          {hasLabel && <Ellipsified fw="inherit">{item.label}</Ellipsified>}
          <Icon name="chevrondown" size={10} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {item.operatorOptions.map((option) => (
          <Menu.Item
            key={option.shortName}
            rightSection={
              option.isSelected ? <Icon name="check" aria-hidden /> : null
            }
            onClick={(event) => handleSelect(option.operator, event)}
          >
            {option.displayName}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
