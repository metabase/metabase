import cx from "classnames";
import { useMemo } from "react";

import CS from "metabase/css/core/index.css";
import SidebarHeader from "metabase/query_builder/components/SidebarHeader";
import type { FilterMBQL } from "metabase-lib/v1/queries/structured/Filter";

import type { DateShortcutOptions } from "./DatePickerShortcutOptions";
import { DATE_SHORTCUT_OPTIONS } from "./DatePickerShortcutOptions";
import { Separator, ShortcutButton } from "./DatePickerShortcuts.styled";

type Props = {
  className?: string;
  dateShortcutOptions?: DateShortcutOptions;

  filter: FilterMBQL;
  onCommit: (value: FilterMBQL[]) => void;
  onFilterChange: (filter: FilterMBQL[]) => void;
  onBack?: () => void;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function DatePickerShortcuts({
  className,
  onFilterChange,
  filter,
  dateShortcutOptions,
  onCommit,
  onBack,
}: Props) {
  const { DAY_OPTIONS, MONTH_OPTIONS, MISC_OPTIONS } = useMemo(
    () => dateShortcutOptions ?? DATE_SHORTCUT_OPTIONS,
    [dateShortcutOptions],
  );

  return (
    <div className={className} data-testid="date-picker-shortcuts">
      {onBack ? (
        <SidebarHeader
          className={cx(CS.textDefault, CS.py1, CS.mb1)}
          onBack={onBack}
        />
      ) : null}
      {DAY_OPTIONS.map(({ displayName, init }) => (
        <ShortcutButton
          key={displayName}
          onClick={() => {
            onCommit(init(filter));
          }}
        >
          {displayName}
        </ShortcutButton>
      ))}
      <Separator />
      {MONTH_OPTIONS.map(({ displayName, init }) => (
        <ShortcutButton
          key={displayName}
          onClick={() => {
            onCommit(init(filter));
          }}
        >
          {displayName}
        </ShortcutButton>
      ))}
      <Separator />
      {MISC_OPTIONS.map(({ displayName, init }) => (
        <ShortcutButton
          key={displayName}
          onClick={() => {
            onFilterChange(init(filter));
          }}
        >
          {displayName}
        </ShortcutButton>
      ))}
    </div>
  );
}
