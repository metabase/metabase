/* eslint-disable react/prop-types */
import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Select, Stack } from "metabase/ui";

// Some properties of visualization settings that are controlled by selects can have a value of `true` or `false`
const VALUE_OVERRIDE = val => {
  if (val === true) {
    return "\0_true";
  } else if (val === false || val === "") {
    return "\0_false";
  } else {
    return val;
  }
};

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
  rightSection,
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
    value: VALUE_OVERRIDE(value) || "",
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
      value={VALUE_OVERRIDE(value)}
      //Mantine V7 select onChange has 2 arguments passed. This breaks the assumption in visualizations/lib/settings.js where the onChange function is defined
      onChange={v => onChange(v)}
      placeholder={options.length === 0 ? placeholderNoOptions : placeholder}
      initiallyOpened={isInitiallyOpen}
      searchable={!!searchProp}
      rightSectionWidth="10px"
      comboboxProps={{
        withinPortal: false,
        floatingStrategy: "fixed",
      }}
      icon={icon}
      iconWidth={iconWidth}
      pl={pl}
      pr={pr}
      rightSection={rightSection}
      styles={styles}
      w={w}
      defaultDropdownOpened={defaultDropdownOpened}
    />
  );
};
