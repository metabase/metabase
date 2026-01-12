import cx from "classnames";
import { useCallback, useMemo } from "react";

import CS from "metabase/css/core/index.css";
import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  ClickBehavior,
  ClickBehaviorType,
  DashboardCard,
} from "metabase-types/api";

import { SidebarItem } from "../SidebarItem";
import { useClickBehaviorOptionName } from "../hooks";
import { clickBehaviorOptions } from "../utils";

import S from "./TypeSelector.module.css";

interface BehaviorOptionProps {
  value: ClickBehaviorType;
  dashcard: DashboardCard;
  icon: IconName;
  hasNextStep: boolean;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export const BehaviorOption = ({
  value,
  dashcard,
  icon,
  onClick,
  hasNextStep,
  selected,
  disabled,
}: BehaviorOptionProps) => {
  const behaviorOptionName = useClickBehaviorOptionName(value, dashcard);
  return (
    <SidebarItem.Selectable
      isSelected={selected}
      onClick={onClick}
      disabled={disabled}
    >
      <SidebarItem.Icon
        className={cx(S.BehaviorOptionIcon, {
          [S.isSelected]: selected,
        })}
        name={selected ? "check" : icon}
        c={selected ? "text-primary-inverse" : "brand"}
      />
      <SidebarItem.Content>
        <SidebarItem.Name>{behaviorOptionName}</SidebarItem.Name>
        {hasNextStep && (
          <span className={CS.mlAuto}>
            <Icon name="chevronright" size={12} />
          </span>
        )}
      </SidebarItem.Content>
    </SidebarItem.Selectable>
  );
};

interface TypeSelectorProps {
  dashcard: DashboardCard;
  clickBehavior: ClickBehavior;
  parameters: UiParameter[];
  updateSettings: (settings?: ClickBehavior) => void;
  moveToNextPage: () => void;
}

export function TypeSelector({
  dashcard,
  clickBehavior,
  parameters,
  updateSettings,
  moveToNextPage,
}: TypeSelectorProps) {
  const options = useMemo(() => {
    return clickBehaviorOptions.filter((option) => option.value !== "action");
  }, []);

  const handleSelect = useCallback(
    (value: ClickBehaviorType) => {
      if (value !== clickBehavior.type) {
        updateSettings(
          value === "actionMenu"
            ? undefined
            : ({ type: value } as ClickBehavior),
        );
      } else if (value !== "actionMenu") {
        moveToNextPage();
      }
    },
    [clickBehavior, updateSettings, moveToNextPage],
  );

  return (
    <div>
      {options.map(({ value, icon }) => (
        <div key={value} className={CS.mb1}>
          <BehaviorOption
            value={value}
            dashcard={dashcard}
            selected={clickBehavior.type === value}
            disabled={value === "crossfilter" && parameters.length === 0}
            onClick={() => handleSelect(value)}
            icon={icon}
            hasNextStep={value !== "actionMenu"}
          />
        </div>
      ))}
    </div>
  );
}
