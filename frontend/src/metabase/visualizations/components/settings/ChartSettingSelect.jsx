/* eslint-disable react/prop-types */
import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Select, Stack } from "metabase/ui";

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
  hiddenIcons,
  searchProp,
  footer,
}) => {
  const disabled =
    options.length === 0 ||
    (options.length === 1 && options[0].value === value);

  const data = options.map(({ name, value }) => ({
    label: name,
    value,
  }));

  const dropdownComponent =
    footer &&
    (({ children }) => (
      <Stack p={0} w="100%" spacing={0}>
        {children}
        {footer}
      </Stack>
    ));

  return (
    <Select
      className={cx(className, CS.block)}
      data={data}
      dropdownComponent={dropdownComponent}
      disabled={disabled}
      value={value}
      onChange={e => onChange(e)}
      placeholder={options.length === 0 ? placeholderNoOptions : placeholder}
      initiallyOpened={isInitiallyOpen}
      wrapperProps={{ id }}
      searchable={!!searchProp}
      styles={{
        input: {
          "&[data-disabled]": hiddenIcons
            ? {
                backgroundColor: "transparent !important",
                border: "none",
              }
            : {},
          fontWeight: "bold",
        },
      }}
      rightSection={hiddenIcons && (() => null)}
    />
  );
};

export default ChartSettingSelect;
