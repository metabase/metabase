import React from "react";
import { t } from "ttag";
import moment from "moment";
import _ from "underscore";

import { Field } from "metabase-types/types/Field";
import { FieldDimension } from "metabase-lib/lib/Dimension";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import SidebarHeader from "metabase/query_builder/components/SidebarHeader";
import { Filter as FilterExpression } from "metabase-types/types/Query";

import { ShortcutButton, Separator } from "./DatePickerShortcuts.styled";

function getDateTimeField(field: Field, bucketing?: string) {
  const dimension = FieldDimension.parseMBQLOrWarn(field);
  if (dimension) {
    if (bucketing) {
      return dimension.withTemporalUnit(bucketing).mbql();
    } else {
      return dimension.withoutTemporalBucketing().mbql();
    }
  }
  return field;
}

type Option = {
  displayName: string;
  init: (filter: any) => any[];
};

const DAY_OPTIONS: Option[] = [
  {
    displayName: t`Today`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      "current",
      "day",
      { include_current: true },
    ],
  },
  {
    displayName: t`Yesterday`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -1,
      "day",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last Week`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -1,
      "week",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 7 Days`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -7,
      "day",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 30 Days`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -30,
      "day",
      { include_current: false },
    ],
  },
];

const MONTH_OPTIONS: Option[] = [
  {
    displayName: t`Last Month`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -1,
      "month",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 3 Months`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -3,
      "month",
      { include_current: false },
    ],
  },
  {
    displayName: t`Last 12 Months`,
    init: filter => [
      "time-interval",
      getDateTimeField(filter[1]),
      -12,
      "month",
      { include_current: false },
    ],
  },
];

const MISC_OPTIONS: Option[] = [
  {
    displayName: t`Specific dates...`,
    init: filter => [
      "=",
      getDateTimeField(filter[1]),
      moment().format("YYYY-MM-DD"),
    ],
  },
  {
    displayName: t`Relative dates...`,
    init: filter => ["time-interval", getDateTimeField(filter[1]), -30, "day"],
  },
  {
    displayName: t`Exclude...`,
    init: filter => ["!=", getDateTimeField(filter[1])],
  },
];

type Props = {
  className?: string;
  primaryColor?: string;

  filter: Filter;
  onCommit: (value: FilterExpression[]) => void;
  onFilterChange: (filter: FilterExpression[]) => void;
  onBack?: () => void;
};

export default function DatePickerShortcuts({
  className,
  onFilterChange,
  filter,
  onCommit,
  onBack,
  primaryColor,
}: Props) {
  const dimension = filter.dimension?.();
  let title = "";
  if (dimension) {
    const field = dimension.field();
    title =
      (field.table ? field.table.displayName() + " – " : "") +
      field.displayName();
  }

  return (
    <div className={className}>
      {onBack ? (
        <SidebarHeader
          className={"text-default py1 mb1"}
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
