import cx from "classnames";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Select, type SelectProps, Stack } from "metabase/ui";
import {
  decodeWidgetValue,
  encodeWidgetValue,
} from "metabase/visualizations/lib/settings/widgets";

import S from "./ChartSettingSelect.module.css";

export type ChartSettingSelectValue = string | number | boolean | null;

type ChartSettingSelectOption = {
  name: string;
  value: ChartSettingSelectValue;
};

type ChartSettingSelectProps = Pick<
  SelectProps,
  | "className"
  | "defaultDropdownOpened"
  | "id"
  | "leftSection"
  | "leftSectionWidth"
  | "pl"
  | "pr"
  | "rightSection"
  | "variant"
  | "w"
> & {
  footer?: ReactNode;
  hasLeftSection?: boolean;
  icon?: SelectProps["leftSection"];
  iconWidth?: SelectProps["leftSectionWidth"];
  onChange: (value: ChartSettingSelectValue) => void;
  options?: ChartSettingSelectOption[];
  placeholder?: string;
  placeholderNoOptions?: string;
  rightSectionWidth?: string;
  searchProp?: string;
  value?: ChartSettingSelectValue;
};

export const ChartSettingSelect = ({
  // Use null if value is undefined. If we pass undefined, Select will create an
  // uncontrolled component because it's wrapped with Uncontrollable.
  className,
  defaultDropdownOpened,
  footer,
  hasLeftSection,
  icon,
  iconWidth,
  id,
  leftSection,
  onChange,
  options = [],
  pl,
  placeholder,
  placeholderNoOptions,
  pr,
  rightSection,
  rightSectionWidth,
  searchProp,
  value = null,
  variant,
  w,
}: ChartSettingSelectProps) => {
  const disabled =
    options.length === 0 ||
    (options.length === 1 && options[0].value === value);

  const data = options.map(({ name, value }) => ({
    label: name,
    value: encodeWidgetValue(value) || "",
  }));

  const inputPaddingRight = rightSectionWidth
    ? `${parseInt(rightSectionWidth, 10) + 8}px`
    : undefined;

  const resolvedLeftSection = leftSection ?? icon;

  const dropdownComponent =
    footer &&
    (({ children }: { children: ReactNode }) => (
      <Stack p={0} w="100%" gap={0}>
        {children}
        {footer}
      </Stack>
    ));
  return (
    <Select
      px={0}
      id={id}
      data-testid="chart-setting-select"
      className={cx(className, CS.block)}
      {...(dropdownComponent ? { dropdownComponent } : {})}
      classNames={{
        root: S.root,
        wrapper: S.wrapper,
        section: S.section,
        input: cx(S.input, { [S.inputWithLeftSection]: hasLeftSection }),
      }}
      data={data}
      disabled={disabled}
      value={value === null ? value : encodeWidgetValue(value)}
      //Mantine V7 select onChange has 2 arguments passed. This breaks the assumption in visualizations/lib/settings.js where the onChange function is defined
      onChange={(v) => {
        onChange(
          v == null ? null : (decodeWidgetValue(v) as ChartSettingSelectValue),
        );
      }}
      placeholder={options.length === 0 ? placeholderNoOptions : placeholder}
      searchable={!!searchProp}
      comboboxProps={{
        withinPortal: false,
        floatingStrategy: "absolute",
      }}
      leftSection={resolvedLeftSection}
      leftSectionWidth={icon != null ? iconWidth : undefined}
      rightSection={rightSection}
      rightSectionProps={
        rightSectionWidth ? { style: { width: rightSectionWidth } } : undefined
      }
      style={
        inputPaddingRight
          ? { "--chart-setting-select-input-padding-right": inputPaddingRight }
          : undefined
      }
      defaultDropdownOpened={defaultDropdownOpened}
      pl={pl}
      pr={pr}
      variant={variant}
      w={w}
    />
  );
};
