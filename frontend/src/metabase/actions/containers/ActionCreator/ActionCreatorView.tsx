import { useCallback, useState } from "react";
import { t } from "ttag";

import ImplicitActionIcon from "metabase/actions/components/ImplicitActionIcon";
import { Button, Stack, Title } from "metabase/ui";
import type {
  ActionFormSettings,
  WritebackImplicitQueryAction,
} from "metabase-types/api";

import {
  ActionCreatorBodyContainer,
  EditorContainer,
  ModalActions,
  ModalLeft,
  ModalRight,
  ModalRoot,
} from "./ActionCreator.styled";
import ActionCreatorHeader from "./ActionCreatorHeader";
import { FormCreator } from "./FormCreator";
import InlineActionSettings, {
  ActionSettingsTriggerButton,
} from "./InlineActionSettings";
import type { SideView } from "./types";

interface ActionCreatorViewProps {
  action: WritebackImplicitQueryAction;
  formSettings: ActionFormSettings;
  canSave: boolean;
  isEditable: boolean;
  onChangeFormSettings: (formSettings: ActionFormSettings) => void;
  onClickSave: () => void;
  onCloseModal?: () => void;
}

const DEFAULT_SIDE_VIEW: SideView = "actionForm";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function ActionCreatorView({
  action,
  formSettings,
  canSave,
  isEditable,
  onChangeFormSettings,
  onClickSave,
  onCloseModal,
}: ActionCreatorViewProps) {
  const [activeSideView, setActiveSideView] =
    useState<SideView>(DEFAULT_SIDE_VIEW);

  const toggleActionSettings = useCallback(() => {
    setActiveSideView((activeSideView) =>
      activeSideView !== "actionSettings"
        ? "actionSettings"
        : DEFAULT_SIDE_VIEW,
    );
  }, []);

  const closeSideView = useCallback(() => {
    setActiveSideView(DEFAULT_SIDE_VIEW);
  }, []);

  return (
    <ModalRoot data-testid="action-creator">
      <ActionCreatorBodyContainer>
        <ModalLeft>
          <ActionCreatorHeader
            name={action.name}
            actionButtons={[
              <ActionSettingsTriggerButton
                key="actionSettings"
                onClick={toggleActionSettings}
              />,
            ]}
          />
          <EditorContainer>
            <Stack align="center" justify="center" w="100%" h="100%">
              <ImplicitActionIcon size={64} />
              <Title order={3}>{t`Auto tracking schema`}</Title>
            </Stack>
          </EditorContainer>
          <ModalActions>
            <Button onClick={onCloseModal} variant="subtle" color="neutral">
              {t`Cancel`}
            </Button>
            {isEditable && (
              <Button
                variant="filled"
                disabled={!canSave}
                onClick={onClickSave}
              >
                {t`Update`}
              </Button>
            )}
          </ModalActions>
        </ModalLeft>
        <ModalRight>
          {activeSideView === "actionForm" ? (
            <FormCreator
              parameters={action.parameters ?? []}
              formSettings={formSettings}
              onChange={onChangeFormSettings}
              onClose={onCloseModal}
            />
          ) : (
            <InlineActionSettings
              action={action}
              formSettings={formSettings}
              isEditable={isEditable}
              onChangeFormSettings={onChangeFormSettings}
              onClose={onCloseModal}
              onBack={closeSideView}
            />
          )}
        </ModalRight>
      </ActionCreatorBodyContainer>
    </ModalRoot>
  );
}
