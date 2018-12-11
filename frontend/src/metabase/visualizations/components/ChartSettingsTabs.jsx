import React from "react";

const ChartSettingsTabs = ({
  currentSection,
  onChangeSection,
  sectionNames,
}) => (
  <div className="border-bottom flex flex-no-shrink pl4">
    <Radio
      value={currentSection}
      onChange={onChangeSection}
      options={sectionNames}
      optionNameFn={v => v}
      optionValueFn={v => v}
      underlined
    />
  </div>
);

export default ChartSettingsTabs;
