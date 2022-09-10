import React, { useCallback } from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";

import DashboardPicker from "metabase/containers/DashboardPicker";
import DataAppPagePicker from "metabase/containers/DataAppPagePicker";
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
  CustomDestinationClickBehaviorEntity,
} from "metabase-types/api";

import { SidebarItem } from "../SidebarItem";
import { Heading } from "../ClickBehaviorSidebar.styled";
import {
  LinkTargetEntityPickerContent,
  SelectedEntityPickerIcon,
  SelectedEntityPickerContent,
} from "./LinkOptions.styled";

function getEntityForLinkTarget(
  linkType: CustomDestinationClickBehaviorEntity,
) {
  if (linkType === "question") {
    return Questions;
  }
  if (linkType === "dashboard" || linkType === "page") {
    return Dashboards;
  }
}

function getPickerComponentForLinkTarget(
  linkType: CustomDestinationClickBehaviorEntity,
) {
  if (linkType === "question") {
    return QuestionPicker;
  }
  if (linkType === "dashboard") {
    return DashboardPicker;
  }
  if (linkType === "page") {
    return DataAppPagePicker;
  }
}

function getPickerIconForLinkTarget(
  linkType: CustomDestinationClickBehaviorEntity,
) {
  if (linkType === "question") {
    return "bar";
  }
  if (linkType === "dashboard") {
    return "dashboard";
  }
  if (linkType === "page") {
    return "document";
  }
  return "unknown";
}

function getPickerModalTitleForLinkTarget(
  linkType: CustomDestinationClickBehaviorEntity,
) {
  if (linkType === "question") {
    return t`Pick a question to link to`;
  }
  if (linkType === "dashboard") {
    return t`Pick a dashboard to link to`;
  }
  if (linkType === "page") {
    return t`Pick a page to link to`;
  }
}

function PickerControl({
  clickBehavior,
  onCancel,
}: {
  clickBehavior: EntityCustomDestinationClickBehavior;
  onCancel: () => void;
}) {
  const Entity = getEntityForLinkTarget(clickBehavior.linkType);

  const renderLabel = useCallback(() => {
    const hasSelectedTarget = clickBehavior.targetId != null;
    if (hasSelectedTarget) {
      return <Entity.Name id={clickBehavior.targetId} />;
    }
    if (clickBehavior.linkType === "question") {
      return t`Pick a question…`;
    }
    if (clickBehavior.linkType === "dashboard") {
      return t`Pick a dashboard`;
    }
    if (clickBehavior.linkType === "page") {
      return t`Pick a page`;
    }
  }, [Entity, clickBehavior]);

  return (
    <SidebarItem.Selectable isSelected padded={false}>
      <LinkTargetEntityPickerContent>
        <SelectedEntityPickerIcon
          name={getPickerIconForLinkTarget(clickBehavior.linkType)}
        />
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

function LinkedEntityPicker({
  dashcard,
  clickBehavior,
  updateSettings,
}: {
  dashcard: DashboardOrderedCard;
  clickBehavior: EntityCustomDestinationClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
  const { linkType } = clickBehavior;
  const hasSelectedTarget = clickBehavior.targetId != null;
  const Picker = getPickerComponentForLinkTarget(linkType);

  const handleSelectLinkTargetEntityId = useCallback(
    targetId => {
      const nextSettings = { ...clickBehavior, targetId };
      const isNewTargetEntity = targetId !== clickBehavior.targetId;
      if (isNewTargetEntity) {
        // For new target entity, parameter mappings for the previous link target
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

  return (
    <div>
      <div className="pb1">
        <ModalWithTrigger
          triggerElement={
            <PickerControl
              clickBehavior={clickBehavior}
              onCancel={handleResetLinkTargetType}
            />
          }
          isInitiallyOpen={!hasSelectedTarget}
        >
          {({ onClose }: { onClose: () => void }) => (
            <ModalContent
              title={getPickerModalTitleForLinkTarget(linkType)}
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
          isDash={linkType === "dashboard" || linkType === "page"}
          clickBehavior={clickBehavior}
          dashcard={dashcard}
          updateSettings={updateSettings}
        />
      )}
    </div>
  );
}

export default LinkedEntityPicker;
