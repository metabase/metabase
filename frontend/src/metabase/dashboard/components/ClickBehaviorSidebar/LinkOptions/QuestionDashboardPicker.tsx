import React, { useCallback } from "react";
import { t } from "ttag";

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

import type {
  Dashboard,
  DashboardId,
  DashboardOrderedCard,
  Card,
  CardId,
  ClickBehavior,
  EntityCustomDestinationClickBehavior,
} from "metabase-types/api";

import { SidebarItem } from "../SidebarItem";
import { Heading } from "../ClickBehaviorSidebar.styled";
import {
  LinkTargetEntityPickerContent,
  SelectedEntityPickerIcon,
  SelectedEntityPickerContent,
} from "./LinkOptions.styled";

function PickerControl({
  isDash,
  clickBehavior,
  onCancel,
}: {
  isDash: boolean;
  clickBehavior: EntityCustomDestinationClickBehavior;
  onCancel: () => void;
}) {
  const Entity = isDash ? Dashboards : Questions;

  const renderLabel = useCallback(() => {
    const hasSelectedTarget = clickBehavior.targetId != null;
    if (hasSelectedTarget) {
      return <Entity.Name id={clickBehavior.targetId} />;
    }
    return isDash ? t`Pick a dashboard...` : t`Pick a question...`;
  }, [Entity, isDash, clickBehavior]);

  return (
    <SidebarItem.Selectable isSelected padded={false}>
      <LinkTargetEntityPickerContent>
        <SelectedEntityPickerIcon name={isDash ? "dashboard" : "bar"} />
        <SelectedEntityPickerContent>
          {renderLabel()}
          <Icon name="chevrondown" size={12} className="ml-auto" />
        </SelectedEntityPickerContent>
      </LinkTargetEntityPickerContent>
      <SidebarItem.CloseIcon onClick={onCancel} />
    </SidebarItem.Selectable>
  );
}

function getTargetClickMappingsHeading(entity: Card | Dashboard) {
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
}: {
  isDash: boolean;
  clickBehavior: EntityCustomDestinationClickBehavior;
  dashcard: DashboardOrderedCard;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
  const Entity = isDash ? Dashboards : Questions;
  return (
    <Entity.Loader id={clickBehavior.targetId}>
      {({ object }: { object: Card | Dashboard }) => (
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

function QuestionDashboardPicker({
  dashcard,
  clickBehavior,
  updateSettings,
}: {
  dashcard: DashboardOrderedCard;
  clickBehavior: EntityCustomDestinationClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
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

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
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
          {({ onClose }: { onClose: () => void }) => (
            <ModalContent
              title={pickerModalTitle}
              onClose={hasSelectedTarget ? onClose : null}
            >
              {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
              {/* @ts-ignore */}
              <Picker
                value={clickBehavior.targetId}
                onChange={(targetId: CardId | DashboardId) => {
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
