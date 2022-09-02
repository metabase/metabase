/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

import Actions from "metabase/entities/actions";

import ClickMappings from "metabase/dashboard/components/ClickMappings";

import { SidebarItemWrapper, SidebarItemStyle } from "./SidebarItem";
import {
  Heading,
  SidebarContent,
  SidebarIconWrapper,
} from "./ClickBehaviorSidebar.styled";

const ActionOption = ({ name, description, isSelected, onClick }) => {
  return (
    <SidebarItemWrapper
      onClick={onClick}
      style={{
        ...SidebarItemStyle,
        backgroundColor: isSelected ? color("brand") : "transparent",
        color: isSelected ? color("white") : "inherit",
        alignItems: description ? "flex-start" : "center",
        marginTop: "2px",
      }}
    >
      <SidebarIconWrapper>
        <Icon
          name="bolt"
          color={isSelected ? color("text-white") : color("brand")}
        />
      </SidebarIconWrapper>
      <div>
        <h4>{name}</h4>
        {description && (
          <span
            className={isSelected ? "text-white" : "text-medium"}
            style={{ width: "95%", marginTop: "2px" }}
          >
            {description}
          </span>
        )}
      </div>
    </SidebarItemWrapper>
  );
};

function ActionOptions({ dashcard, clickBehavior, updateSettings }) {
  return (
    <SidebarContent>
      <Heading className="text-medium">{t`Pick an action`}</Heading>
      <Actions.ListLoader>
        {({ actions }) => {
          const selectedAction = actions.find(
            action => action.id === clickBehavior.action,
          );
          return (
            <>
              {actions.map(action => (
                <ActionOption
                  key={action.id}
                  name={action.name}
                  description={action.description}
                  isSelected={clickBehavior.action === action.id}
                  onClick={() =>
                    updateSettings({
                      type: clickBehavior.type,
                      action: action.id,
                      emitter_id: clickBehavior.emitter_id,
                    })
                  }
                />
              ))}
              {selectedAction && (
                <ClickMappings
                  isAction
                  object={selectedAction}
                  dashcard={dashcard}
                  clickBehavior={clickBehavior}
                  updateSettings={updateSettings}
                />
              )}
            </>
          );
        }}
      </Actions.ListLoader>
    </SidebarContent>
  );
}

export default ActionOptions;
