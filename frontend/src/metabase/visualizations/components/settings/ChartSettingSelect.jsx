/* eslint-disable react/prop-types */
import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Select, Stack } from "metabase/ui";
import {
  decodeWidgetValue,
  encodeWidgetValue,
} from "metabase/visualizations/lib/settings/widgets";

export const ChartSettingSelect = ({
  // Use null if value is undefined. If we pass undefined, Select will create an
  // uncontrolled component because it's wrapped with Uncontrollable.
  value = null,
  onChange,
  options = [],
  isInitiallyOpen,
  className,
  placeholder,
  placeholderNoOptions,
  id,
  searchProp,
  icon,
  iconWidth,
  pl,
  pr,
  leftSection,
  rightSection,
  rightSectionWidth,
  styles,
  w,
  footer,
  defaultDropdownOpened,
}) => {
  const disabled =
    options.length === 0 ||
    (options.length === 1 && options[0].value === value);

  const data = options.map(({ name, value }) => ({
    label: name,
    value: encodeWidgetValue(value) || "",
  }));

  const dropdownComponent =
    footer &&
    (({ children }) => (
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
      data={data}
      dropdownComponent={dropdownComponent}
      disabled={disabled}
      value={encodeWidgetValue(value)}
      //Mantine V7 select onChange has 2 arguments passed. This breaks the assumption in visualizations/lib/settings.js where the onChange function is defined
      onChange={(v) => onChange(decodeWidgetValue(v))}
      placeholder={options.length === 0 ? placeholderNoOptions : placeholder}
      initiallyOpened={isInitiallyOpen}
      searchable={!!searchProp}
      comboboxProps={{
        withinPortal: false,
        floatingStrategy: "fixed",
      }}
      icon={icon}
      iconWidth={iconWidth}
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
