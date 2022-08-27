/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

import { clickBehaviorOptions, getClickBehaviorOptionName } from "../utils";
import { SidebarItem } from "../SidebarItem";
import { SidebarIconWrapper } from "../ClickBehaviorSidebar.styled";

const BehaviorOption = ({
  option,
  icon,
  onClick,
  hasNextStep,
  selected,
  disabled,
}) => (
  <SidebarItem.Selectable
    isSelected={selected}
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
  </SidebarItem.Selectable>
);

function TypeSelector({
  updateSettings,
  clickBehavior,
  dashcard,
  parameters,
  moveToNextPage,
}) {
  const handleSelect = useCallback(
    value => {
      if (value !== clickBehavior.type) {
        updateSettings(value === "menu" ? undefined : { type: value });
      } else if (value !== "menu") {
        moveToNextPage();
      }
    },
    [clickBehavior, updateSettings, moveToNextPage],
  );

  return (
    <div>
      {clickBehaviorOptions.map(({ value, icon }) => (
        <div key={value} className="mb1">
          <BehaviorOption
            option={getClickBehaviorOptionName(value, dashcard)}
            selected={clickBehavior.type === value}
            disabled={value === "crossfilter" && parameters.length === 0}
            onClick={() => handleSelect(value)}
            icon={icon}
            hasNextStep={value !== "menu"}
          />
        </div>
      ))}
    </div>
  );
}

export default TypeSelector;
