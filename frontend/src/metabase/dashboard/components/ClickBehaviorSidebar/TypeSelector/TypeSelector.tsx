import { useCallback, useMemo } from "react";

import { Icon, IconName } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

import type { DashboardOrderedCard, ClickBehavior } from "metabase-types/api";
import type { UiParameter } from "metabase-lib/parameters/types";

import { clickBehaviorOptions, getClickBehaviorOptionName } from "../utils";
import { SidebarItem } from "../SidebarItem";

import { BehaviorOptionIcon } from "./TypeSelector.styled";

interface BehaviorOptionProps {
  option: string;
  icon: IconName;
  hasNextStep: boolean;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export const BehaviorOption = ({
  option,
  icon,
  onClick,
  hasNextStep,
  selected,
  disabled,
}: BehaviorOptionProps) => (
  <SidebarItem.Selectable
    isSelected={selected}
    onClick={onClick}
    disabled={disabled}
  >
    <BehaviorOptionIcon
      name={selected ? "check" : icon}
      color={selected ? color("white") : color("brand")}
      isSelected={selected}
    />
    <SidebarItem.Content>
      <SidebarItem.Name>{option}</SidebarItem.Name>
      {hasNextStep && (
        <span className="ml-auto">
          <Icon name="chevronright" size={12} />
        </span>
      )}
    </SidebarItem.Content>
  </SidebarItem.Selectable>
);

interface TypeSelectorProps {
  dashcard: DashboardOrderedCard;
  clickBehavior: ClickBehavior;
  parameters: UiParameter[];
  updateSettings: (settings?: ClickBehavior) => void;
  moveToNextPage: () => void;
}

function TypeSelector({
  dashcard,
  clickBehavior,
  parameters,
  updateSettings,
  moveToNextPage,
}: TypeSelectorProps) {
  const options = useMemo(() => {
    return clickBehaviorOptions.filter(option => option.value !== "action");
  }, []);

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
      {options.map(({ value, icon }) => (
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TypeSelector;
