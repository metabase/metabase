import cx from "classnames";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Select, type SelectProps } from "metabase/ui";
import {
  decodeWidgetValue,
  encodeWidgetValue,
} from "metabase/visualizations/lib/settings/widgets";

interface ChartSettingSelectOption {
  name: string;
  value: unknown;
}

interface ChartSettingSelectProps {
  value?: unknown;
  onChange: (value: unknown) => void;
  options: ChartSettingSelectOption[];
  className?: string;
  placeholder?: string;
  placeholderNoOptions?: string;
  id?: string;
  searchProp?: string;
  pl?: string | number;
  pr?: string | number;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  rightSectionWidth?: string | number;
  styles?: SelectProps["styles"];
  w?: string | number;
  defaultDropdownOpened?: boolean;
}

export const ChartSettingSelect = ({
  // Use null if value is undefined. If we pass undefined, Select will create an
  // uncontrolled component because it's wrapped with Uncontrollable.
  value = null,
  onChange,
  options,
  className,
  placeholder,
  placeholderNoOptions,
  id,
  searchProp,
  pl,
  pr,
  leftSection,
  rightSection,
  rightSectionWidth,
  styles,
  w,
  defaultDropdownOpened,
}: ChartSettingSelectProps) => {
  const disabled =
    options.length === 0 ||
    (options.length === 1 && options[0].value === value);

  const data = options.map(({ name, value }) => ({
    label: name,
    value: encodeWidgetValue(value) || "",
  }));

  return (
    <Select
      px={0}
      id={id}
      data-testid="chart-setting-select"
      className={cx(className, CS.block)}
      data={data}
      disabled={disabled}
      value={encodeWidgetValue(value)}
      //Mantine V7 select onChange has 2 arguments passed. This breaks the assumption in visualizations/lib/settings.js where the onChange function is defined
      onChange={(v) => onChange(decodeWidgetValue(v))}
      placeholder={options.length === 0 ? placeholderNoOptions : placeholder}
      searchable={!!searchProp}
      comboboxProps={{
        withinPortal: false,
        floatingStrategy: "fixed",
      }}
      pl={pl}
      pr={pr}
      leftSection={leftSection}
      rightSection={rightSection}
      rightSectionProps={
        rightSectionWidth ? { style: { width: rightSectionWidth } } : undefined
      }
      styles={styles}
      w={w}
      defaultDropdownOpened={defaultDropdownOpened}
    />
  );
};
