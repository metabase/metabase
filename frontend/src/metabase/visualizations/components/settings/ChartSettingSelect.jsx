/* eslint-disable react/prop-types */
import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Select, Stack } from "metabase/ui";
import {
  decodeWidgetValue,
  encodeWidgetValue,
} from "metabase/visualizations/lib/settings/widgets";

/**
 * Groups options if they are temporal (month-based) data
 * Returns data in a format suitable for the Select component
 */
const organizeOptionsIntoGroups = (options) => {
  // Check if options look like temporal data by looking for month names
  const monthPatterns = [
    /January|February|March|April|May|June|July|August|September|October|November|December/i,
    /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i,
  ];

  const hasMonthsInOptions = options.some((option) =>
    monthPatterns.some(
      (pattern) => typeof option.name === "string" && pattern.test(option.name),
    ),
  );

  if (!hasMonthsInOptions) {
    // If options don't look like temporal data, return flat list
    return options.map(({ name, value }) => ({
      label: name,
      value: encodeWidgetValue(value) || "",
    }));
  }

  // Extract year from options that follow pattern like "Month YYYY"
  const optionsByYear = {};

  options.forEach((option) => {
    const yearMatch =
      typeof option.name === "string" && option.name.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : "Other";

    if (!optionsByYear[year]) {
      optionsByYear[year] = [];
    }

    optionsByYear[year].push({
      label: option.name,
      value: encodeWidgetValue(option.value) || "",
    });
  });

  // Convert to groups format for Mantine Select
  const groups = Object.entries(optionsByYear).map(([year, options]) => ({
    group: year,
    items: options,
  }));

  // Sort groups by year descending (newest first)
  return groups.sort((a, b) => {
    if (a.group === "Other") {
      return 1;
    }
    if (b.group === "Other") {
      return -1;
    }
    return b.group.localeCompare(a.group);
  });
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

  // Determine if we should make dropdown searchable based on number of options
  const shouldMakeSearchable = options.length > 10;

  // Organize options into groups if they are temporal data
  const data = organizeOptionsIntoGroups(options);

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
      searchable={searchProp || shouldMakeSearchable}
      comboboxProps={{
        withinPortal: false,
        floatingStrategy: "fixed",
      }}
      maxDropdownHeight={400}
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
