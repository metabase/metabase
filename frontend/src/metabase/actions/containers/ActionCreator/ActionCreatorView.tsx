import cx from "classnames";
import { useCallback, useState } from "react";
import { t } from "ttag";

import SidebarContentS from "metabase/common/components/SidebarContent/SidebarContent.module.css";
import CS from "metabase/css/core/index.css";
import { Box, Button, Flex, Stack } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import type { ActionFormSettings, WritebackAction } from "metabase-types/api";

import { ActionCreatorHeader } from "./ActionCreatorHeader";
import S from "./ActionCreatorView.module.css";
import { FormCreator } from "./FormCreator";
import {
  ActionSettingsTriggerButton,
  InlineActionSettings,
} from "./InlineActionSettings";
import type {
  ActionCreatorUIProps,
  DataReferenceSlot,
  SideView,
} from "./types";

interface ActionCreatorViewProps extends ActionCreatorUIProps {
  action: Partial<WritebackAction>;
  formSettings: ActionFormSettings;

  canSave: boolean;
  isNew: boolean;
  isEditable: boolean;
  dataReference: DataReferenceSlot;

  children: React.ReactNode;

  onChangeAction: (action: Partial<WritebackAction>) => void;
  onChangeFormSettings: (formSettings: ActionFormSettings) => void;
  onClickSave: () => void;
  onCloseModal?: () => void;
}

const DEFAULT_SIDE_VIEW: SideView = "actionForm";

export function ActionCreatorView({
  action,
  formSettings,
  canSave,
  isNew,
  isEditable,
  canRename,
  canChangeFieldSettings,
  dataReference,
  children,
  onChangeAction,
  onChangeFormSettings,
  onClickSave,
  onCloseModal,
}: ActionCreatorViewProps) {
  const [activeSideView, setActiveSideView] =
    useState<SideView>(DEFAULT_SIDE_VIEW);

  const toggleDataRef = useCallback(() => {
    setActiveSideView((activeSideView) => {
      if (activeSideView !== "dataReference") {
        return "dataReference";
      }

      return DEFAULT_SIDE_VIEW;
    });
  }, []);

  const toggleActionSettings = useCallback(() => {
    setActiveSideView((activeSideView) => {
      if (activeSideView !== "actionSettings") {
        return "actionSettings";
      }

      return DEFAULT_SIDE_VIEW;
    });
  }, []);

  const closeSideView = useCallback(() => {
    setActiveSideView(DEFAULT_SIDE_VIEW);
  }, []);

  return (
    <Stack
      // 2px less for the modal content border, which would otherwise add a scrollbar
      h="calc(90dvh - 2px)"
      gap={0}
      data-testid="action-creator"
    >
      <Box className={cx(S.columns, CS.overflowYAuto)} flex={1}>
        <Stack className={S.borderRight} pos="relative" gap={0}>
          <ActionCreatorHeader
            name={action.name ?? t`New Action`}
            canRename={canRename}
            isEditable={isEditable}
            onChangeName={(name) => onChangeAction({ name })}
            actionButtons={[
              <dataReference.TriggerButton
                key="dataReference"
                onClick={toggleDataRef}
              />,
              <ActionSettingsTriggerButton
                key="actionSettings"
                onClick={toggleActionSettings}
              />,
            ].filter(isNotNull)}
          />
          <Box
            className={CS.overflowYAuto}
            flex="1 1 0"
            bg="background_page-secondary"
          >
            {children}
          </Box>
          <Flex
            className={S.borderTop}
            flex="0 0 auto"
            justify="space-between"
            gap="lg"
            p="lg"
          >
            <Button onClick={onCloseModal} variant="subtle" color="neutral">
              {t`Cancel`}
            </Button>
            {isEditable && (
              <Button
                variant="filled"
                disabled={!canSave}
                onClick={onClickSave}
              >
                {isNew ? t`Save` : t`Update`}
              </Button>
            )}
          </Flex>
        </Stack>
        <Stack
          className={cx(SidebarContentS.stickyHeader, CS.overflowHidden)}
          pos="relative"
          gap={0}
        >
          {activeSideView === "actionForm" ? (
            <FormCreator
              actionType={action.type ?? "query"}
              parameters={action.parameters ?? []}
              formSettings={formSettings}
              isEditable={isEditable && canChangeFieldSettings}
              onChange={onChangeFormSettings}
              onClose={onCloseModal}
            />
          ) : activeSideView === "dataReference" ? (
            <dataReference.Panel
              onClose={onCloseModal}
              onBack={closeSideView}
            />
          ) : activeSideView === "actionSettings" ? (
            <InlineActionSettings
              action={action}
              formSettings={formSettings}
              isEditable={isEditable}
              onChangeFormSettings={onChangeFormSettings}
              onClose={onCloseModal}
              onBack={closeSideView}
            />
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}
