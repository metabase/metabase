/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import Icon from "metabase/components/Icon";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";

import DashboardPicker from "metabase/containers/DashboardPicker";
import QuestionPicker from "metabase/containers/QuestionPicker";

import ClickMappings, {
  clickTargetObjectType,
} from "metabase/dashboard/components/ClickMappings";

import { SidebarItem } from "../SidebarItem";
import {
  CloseIconContainer,
  Heading,
  SidebarIconWrapper,
} from "../ClickBehaviorSidebar.styled";
import { LinkTargetEntityPickerContent } from "./LinkOptions.styled";

function PickerControl({ isDash, clickBehavior, onCancel }) {
  const Entity = isDash ? Dashboards : Questions;

  const renderLabel = useCallback(() => {
    const hasSelectedTarget = clickBehavior.targetId != null;
    if (hasSelectedTarget) {
      return <Entity.Name id={clickBehavior.targetId} />;
    }
    return isDash ? t`Pick a dashboard...` : t`Pick a question...`;
  }, [isDash, clickBehavior]);

  return (
    <SidebarItem.Selectable isSelected padded={false}>
      <LinkTargetEntityPickerContent>
        <SidebarIconWrapper style={{ borderColor: "transparent" }}>
          <Icon name={isDash ? "dashboard" : "bar"} />
        </SidebarIconWrapper>
        <div className="flex align-center full text-bold">
          {renderLabel()}
          <Icon name="chevrondown" size={12} className="ml-auto" />
        </div>
      </LinkTargetEntityPickerContent>
      <CloseIconContainer onClick={onCancel}>
        <Icon name="close" size={12} />
      </CloseIconContainer>
    </SidebarItem.Selectable>
  );
}

function getTargetClickMappingsHeading(entity) {
  return {
    dashboard: t`Pass values to this dashboard's filters (optional)`,
    native: t`Pass values to this question's variables (optional)`,
    gui: t`Pass values to filter this question (optional)`,
  }[clickTargetObjectType(entity)];
}

function TargetClickMappings({
  isDash,
  clickBehavior,
  dashcard,
  updateSettings,
}) {
  const Entity = isDash ? Dashboards : Questions;
  return (
    <Entity.Loader id={clickBehavior.targetId}>
      {({ object }) => (
        <div className="pt1">
          <Heading>{getTargetClickMappingsHeading(object)}</Heading>
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
  );
}

function QuestionDashboardPicker({ dashcard, clickBehavior, updateSettings }) {
  const isDash = clickBehavior.linkType === "dashboard";
  const hasSelectedTarget = clickBehavior.targetId != null;
  const Picker = isDash ? DashboardPicker : QuestionPicker;

  const handleSelectLinkTargetEntityId = useCallback(
    targetId => {
      const nextSettings = { ...clickBehavior, targetId };
      const isNewTargetEntity = targetId !== clickBehavior.targetId;
      if (isNewTargetEntity) {
        // For new target question/dashboard,
        // parameter mappings for the previous link target question/dashboard
        // don't make sense and have to be reset
        nextSettings.parameterMapping = {};
      }
      updateSettings(nextSettings);
    },
    [clickBehavior, updateSettings],
  );

  const handleResetLinkTargetType = useCallback(() => {
    updateSettings({
      type: clickBehavior.type,
      linkType: null,
    });
  }, [clickBehavior, updateSettings]);

  const pickerModalTitle = isDash
    ? t`Pick a dashboard to link to`
    : t`Pick a question to link to`;

  return (
    <div>
      <div className="pb1">
        <ModalWithTrigger
          triggerElement={
            <PickerControl
              isDash={isDash}
              clickBehavior={clickBehavior}
              onCancel={handleResetLinkTargetType}
            />
          }
          isInitiallyOpen={!hasSelectedTarget}
        >
          {({ onClose }) => (
            <ModalContent
              title={pickerModalTitle}
              onClose={hasSelectedTarget ? onClose : null}
            >
              <Picker
                value={clickBehavior.targetId}
                onChange={targetId => {
                  handleSelectLinkTargetEntityId(targetId);
                  onClose();
                }}
              />
            </ModalContent>
          )}
        </ModalWithTrigger>
      </div>
      {hasSelectedTarget && (
        <TargetClickMappings
          isDash={isDash}
          clickBehavior={clickBehavior}
          dashcard={dashcard}
          updateSettings={updateSettings}
        />
      )}
    </div>
  );
}

export default QuestionDashboardPicker;
