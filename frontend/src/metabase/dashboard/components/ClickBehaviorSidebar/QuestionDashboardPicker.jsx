/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import { color } from "metabase/lib/colors";

import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";

import DashboardPicker from "metabase/containers/DashboardPicker";
import QuestionPicker from "metabase/containers/QuestionPicker";

import ClickMappings, {
  clickTargetObjectType,
} from "metabase/dashboard/components/ClickMappings";

import { SidebarItemClasses, SidebarItemStyle } from "./SidebarItem";
import {
  CloseIconContainer,
  Heading,
  SidebarIconWrapper,
  SidebarItem,
} from "./ClickBehaviorSidebar.styled";

function QuestionDashboardPicker({ dashcard, clickBehavior, updateSettings }) {
  const isDash = clickBehavior.linkType === "dashboard";
  const Entity = isDash ? Dashboards : Questions;
  const Picker = isDash ? DashboardPicker : QuestionPicker;
  return (
    <div>
      <div className="pb1">
        <ModalWithTrigger
          triggerElement={
            <div
              className={cx(SidebarItemClasses, "overflow-hidden")}
              style={{
                marginLeft: SidebarItemStyle.marginLeft,
                marginRight: SidebarItemStyle.marginRight,
                backgroundColor: color("brand"),
                color: color("white"),
              }}
            >
              <SidebarItem
                style={{
                  paddingLeft: SidebarItemStyle.paddingLeft,
                  paddingRight: SidebarItemStyle.paddingRight,
                  paddingTop: SidebarItemStyle.paddingTop,
                  paddingBottom: SidebarItemStyle.paddingBottom,
                }}
              >
                <SidebarIconWrapper style={{ borderColor: "transparent" }}>
                  <Icon name={isDash ? "dashboard" : "bar"} />
                </SidebarIconWrapper>
                <div className="flex align-center full text-bold">
                  {clickBehavior.targetId == null ? (
                    isDash ? (
                      t`Pick a dashboard...`
                    ) : (
                      t`Pick a question...`
                    )
                  ) : (
                    <Entity.Name id={clickBehavior.targetId} />
                  )}
                  <Icon name="chevrondown" size={12} className="ml-auto" />
                </div>
              </SidebarItem>
              <CloseIconContainer
                onClick={() =>
                  updateSettings({
                    type: clickBehavior.type,
                    linkType: null,
                  })
                }
              >
                <Icon name="close" size={12} />
              </CloseIconContainer>
            </div>
          }
          isInitiallyOpen={clickBehavior.targetId == null}
        >
          {({ onClose }) => (
            <ModalContent
              title={
                isDash
                  ? t`Pick a dashboard to link to`
                  : t`Pick a question to link to`
              }
              onClose={clickBehavior.targetId != null ? onClose : null}
            >
              <Picker
                value={clickBehavior.targetId}
                onChange={targetId => {
                  updateSettings({
                    ...clickBehavior,
                    ...(targetId !== clickBehavior.targetId
                      ? { parameterMapping: {} }
                      : {}),
                    targetId,
                  });
                  onClose();
                }}
              />
            </ModalContent>
          )}
        </ModalWithTrigger>
      </div>
      {clickBehavior.targetId != null && (
        <Entity.Loader id={clickBehavior.targetId}>
          {({ object }) => (
            <div className="pt1">
              <Heading>
                {
                  {
                    dashboard: t`Pass values to this dashboard's filters (optional)`,
                    native: t`Pass values to this question's variables (optional)`,
                    gui: t`Pass values to filter this question (optional)`,
                  }[clickTargetObjectType(object)]
                }
              </Heading>
              <ClickMappings
                object={object}
                dashcard={dashcard}
                isDash={isDash}
                clickBehavior={clickBehavior}
                updateSettings={updateSettings}
              />
            </div>
          )}
        </Entity.Loader>
      )}
    </div>
  );
}

export default QuestionDashboardPicker;
