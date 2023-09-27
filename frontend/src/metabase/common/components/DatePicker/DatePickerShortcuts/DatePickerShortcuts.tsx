import { Fragment } from "react";
import { t } from "ttag";
import { Stack, UnstyledButton, Divider } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DateFilterType } from "../types";

interface ShortcutOption {
  name: string;
  init: (column: Lib.ColumnMetadata) => Lib.ExpressionClause;
}

interface NavigationOption {
  name: string;
  type: DateFilterType;
}

const DAY_OPTIONS: ShortcutOption[] = [
  {
    name: t`Today`,
    init: column =>
      Lib.relativeDateFilterClause({
        column,
        value: "current",
        unit: "day",
      }),
  },
  {
    name: t`Yesterday`,
    init: column =>
      Lib.relativeDateFilterClause({
        column,
        value: -1,
        unit: "day",
      }),
  },
  {
    name: t`Last Week`,
    init: column =>
      Lib.relativeDateFilterClause({
        column,
        value: -1,
        unit: "week",
      }),
  },
  {
    name: t`Last 7 Days`,
    init: column =>
      Lib.relativeDateFilterClause({
        column,
        value: -7,
        unit: "day",
      }),
  },
  {
    name: t`Last 30 Days`,
    init: column =>
      Lib.relativeDateFilterClause({
        column,
        value: -30,
        unit: "day",
      }),
  },
];

const MONTH_OPTIONS: ShortcutOption[] = [
  {
    name: t`Last Month`,
    init: column =>
      Lib.relativeDateFilterClause({
        column,
        value: -1,
        unit: "month",
      }),
  },
  {
    name: t`Last 3 Months`,
    init: column =>
      Lib.relativeDateFilterClause({
        column,
        value: -3,
        unit: "month",
      }),
  },
  {
    name: t`Last 12 Months`,
    init: column =>
      Lib.relativeDateFilterClause({
        column,
        value: -12,
        unit: "month",
      }),
  },
];

const SHORTCUT_OPTIONS = [DAY_OPTIONS, MONTH_OPTIONS];

const NAVIGATION_OPTIONS: NavigationOption[] = [
  {
    name: t`Specific dates...`,
    type: "specific",
  },
  {
    name: t`Relative dates...`,
    type: "relative",
  },
  {
    name: t`Exclude...`,
    type: "exclude",
  },
];

export interface DatePickerShortcutsProps {
  column: Lib.ColumnMetadata;
  onChange: (clause: Lib.ExpressionClause) => void;
  onNavigate: (type: DateFilterType) => void;
}

export const DatePickerShortcuts = ({
  column,
  onChange,
  onNavigate,
}: DatePickerShortcutsProps) => {
  const handleChange = (option: ShortcutOption) => {
    onChange(option.init(column));
  };

  const handleNavigate = (option: NavigationOption) => {
    onNavigate(option.type);
  };

  return (
    <Stack>
      {SHORTCUT_OPTIONS.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          {group.map((option, optionIndex) => (
            <UnstyledButton
              key={optionIndex}
              onClick={() => handleChange(option)}
            >
              {option.name}
            </UnstyledButton>
          ))}
          <Divider />
        </Fragment>
      ))}
      {NAVIGATION_OPTIONS.map((option, optionIndex) => (
        <UnstyledButton
          key={optionIndex}
          onClick={() => handleNavigate(option)}
        >
          {option.name}
        </UnstyledButton>
      ))}
    </Stack>
  );
};
