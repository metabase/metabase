import { useMemo } from "react";

import SidebarHeader from "metabase/query_builder/components/SidebarHeader";
import type { Filter as FilterExpression } from "metabase-types/api";
import type Filter from "metabase-lib/queries/structured/Filter";

import { ShortcutButton, Separator } from "./DatePickerShortcuts.styled";
import type { DateShortcutOptions } from "./DatePickerShortcutOptions";
import { DATE_SHORTCUT_OPTIONS } from "./DatePickerShortcutOptions";

type Props = {
  className?: string;
  primaryColor?: string;
  dateShortcutOptions?: DateShortcutOptions;

  filter: Filter;
  onCommit: (value: FilterExpression[]) => void;
  onFilterChange: (filter: FilterExpression[]) => void;
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
  primaryColor,
}: Props) {
  const dimension = filter.dimension?.();
  let title = "";
  if (dimension) {
    const field = dimension.field();
    title = field.displayName({ includeTable: true });
  }

  const { DAY_OPTIONS, MONTH_OPTIONS, MISC_OPTIONS } = useMemo(
    () => dateShortcutOptions ?? DATE_SHORTCUT_OPTIONS,
    [dateShortcutOptions],
  );

  return (
    <div className={className} data-testid="date-picker-shortcuts">
      {onBack ? (
        <SidebarHeader
          className="text-default py1 mb1"
          title={title}
          onBack={onBack}
        />
      ) : null}
      {DAY_OPTIONS.map(({ displayName, init }) => (
        <ShortcutButton
          key={displayName}
          primaryColor={primaryColor}
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
          primaryColor={primaryColor}
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
          primaryColor={primaryColor}
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
