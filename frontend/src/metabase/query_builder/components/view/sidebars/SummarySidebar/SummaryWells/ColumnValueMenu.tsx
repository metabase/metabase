import { t } from "ttag";

import { Icon, Menu, UnstyledButton } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "../SummarySidebar.module.css";
import type { SummaryValueItem } from "../types";
import { changeValueOperator } from "../utils";

type ColumnValueMenuProps = {
  query: Lib.Query;
  stageIndex: number;
  item: Extract<SummaryValueItem, { kind: "column" }>;
  onChange: (nextQuery: Lib.Query) => void;
};

export function ColumnValueMenu({
  query,
  stageIndex,
  item,
  onChange,
}: ColumnValueMenuProps) {
  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <UnstyledButton
          className={S.chipButton}
          aria-label={t`Change how ${item.label} is calculated`}
        >
          <span className={S.chipLabel}>{item.label}</span>
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
            onClick={() =>
              onChange(
                changeValueOperator(query, stageIndex, item, option.operator),
              )
            }
          >
            {option.displayName}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
