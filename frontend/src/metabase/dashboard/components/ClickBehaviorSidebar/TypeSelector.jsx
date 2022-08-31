/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

import { clickBehaviorOptions, getClickBehaviorOptionName } from "./utils";
import { SidebarItemWrapper, SidebarItemStyle } from "./SidebarItem";
import { SidebarIconWrapper } from "./ClickBehaviorSidebar.styled";

const BehaviorOption = ({
  option,
  icon,
  onClick,
  hasNextStep,
  selected,
  disabled,
}) => (
  <SidebarItemWrapper
    style={{
      ...SidebarItemStyle,
      backgroundColor: selected ? color("brand") : "transparent",
      color: selected ? color("white") : "inherit",
    }}
    onClick={onClick}
    disabled={disabled}
  >
    <SidebarIconWrapper style={{ borderColor: selected && "transparent" }}>
      <Icon
        name={selected ? "check" : icon}
        color={selected ? color("white") : color("brand")}
      />
    </SidebarIconWrapper>
    <div className="flex align-center full">
      <h4>{option}</h4>
      {hasNextStep && (
        <span className="ml-auto">
          <Icon name="chevronright" size={12} />
        </span>
      )}
    </div>
  </SidebarItemWrapper>
);

function TypeSelector({
  updateSettings,
  clickBehavior,
  dashcard,
  parameters,
  moveToNextPage,
}) {
  return (
    <div>
      {clickBehaviorOptions.map(({ value, icon }) => (
        <div key={value} className="mb1">
          <BehaviorOption
            onClick={() => {
              if (value !== clickBehavior.type) {
                updateSettings(value === "menu" ? undefined : { type: value });
              } else if (value !== "menu") {
                moveToNextPage(); // if it didn't change, we need to advance here rather than in `componentDidUpdate`
              }
            }}
            icon={icon}
            option={getClickBehaviorOptionName(value, dashcard)}
            hasNextStep={value !== "menu"}
            selected={clickBehavior.type === value}
            disabled={value === "crossfilter" && parameters.length === 0}
          />
        </div>
      ))}
    </div>
  );
}

export default TypeSelector;
