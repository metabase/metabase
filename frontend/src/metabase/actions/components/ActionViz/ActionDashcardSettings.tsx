import { useMemo, useState } from "react";
import { t } from "ttag";

import ActionCreator from "metabase/actions/containers/ActionCreator";
import { isModelAction } from "metabase/actions/utils";
import EmptyState from "metabase/components/EmptyState";
import LegacyModal from "metabase/components/Modal";
import LegacyButton from "metabase/core/components/Button/Button";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Icon,
  Modal,
  Stack,
  Tooltip,
  rem,
} from "metabase/ui";
import type {
  ActionDashboardCard,
  Dashboard,
  WritebackAction,
} from "metabase-types/api";

import {
  ActionSettingsHeader,
  ModalActions,
  ParameterMapperContainer,
} from "./ActionDashcardSettings.styled";
import {
  ActionParameterMappingForm,
  getTargetKey,
} from "./ActionParameterMapping";
import { ExplainerText } from "./ExplainerText";
import {
  getParameterDefaultValue,
  isParameterHidden,
  isParameterRequired,
} from "./utils";

interface Props {
  action: WritebackAction; // TODO: this should be DataGridWritebackAction, fix this when replacing this legacy parameters form
  dashboard: Dashboard;
  dashcard: ActionDashboardCard;
  onChooseNewAction: () => void;
  onChangeAction: (newAction: WritebackAction) => void;
  onClose: () => void;
}

export function ActionDashcardSettings({
  action,
  dashboard,
  dashcard,
  onChooseNewAction,
  onChangeAction,
  onClose,
}: Props) {
  const [showEditModal, setShowEditModal] = useState(false);

  const hasParameters = !!action.parameters?.length;
  const currentMappings = useMemo(
    () =>
      Object.fromEntries(
        dashcard.parameter_mappings?.map((mapping) => [
          getTargetKey(mapping),
          mapping.parameter_id,
        ]) ?? [],
      ),
    [dashcard.parameter_mappings],
  );

  const isFormInvalid = action.parameters?.some((actionParameter) => {
    const isHidden = isParameterHidden(action, actionParameter);
    const isRequired = isParameterRequired(action, actionParameter);
    const isParameterMapped =
      currentMappings[getTargetKey(actionParameter)] != null;
    const defaultValue = getParameterDefaultValue(action, actionParameter);
    const hasDefaultValue = defaultValue != null;

    return isHidden && isRequired && !isParameterMapped && !hasDefaultValue;
  });

  const handleEditAction = () => {
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
  };

  return (
    <>
      <Modal.Content>
        <Modal.Header p="2rem 1.5rem 0.5rem 1.2rem">
          <Button
            leftSection={<Icon name="chevronleft" />}
            color="text-dark"
            variant="subtle"
            size="compact-md"
            onClick={onChooseNewAction}
          >{t`Choose a new action`}</Button>
          <Group
            gap="xs"
            mr={rem(-5) /* aligns cross with modal right padding */}
          >
            {isModelAction(action) && (
              <Tooltip label={t`Edit action`}>
                <ActionIcon
                  variant="transparent"
                  color="var(--mb-color-text-tertiary)"
                  onClick={handleEditAction}
                >
                  <Icon name="pencil" />
                </ActionIcon>
              </Tooltip>
            )}
            <Modal.CloseButton />
          </Group>
        </Modal.Header>
        <Modal.Body p="1rem 2rem">
          <Stack>
            {hasParameters ? (
              <>
                <ActionSettingsHeader>
                  {t`Where should the values for '${action.name}' come from?`}
                </ActionSettingsHeader>
                <ExplainerText />
              </>
            ) : (
              <ParameterMapperContainer>
                <EmptyActionState />
              </ParameterMapperContainer>
            )}
            <ParameterMapperContainer>
              <ActionParameterMappingForm
                dashcard={dashcard}
                dashboard={dashboard}
                action={action}
                currentMappings={currentMappings}
              />
            </ParameterMapperContainer>
            <Divider mx="-2rem" />
            <ModalActions>
              <LegacyButton primary onClick={onClose} disabled={isFormInvalid}>
                {t`Done`}
              </LegacyButton>
            </ModalActions>
          </Stack>
        </Modal.Body>
      </Modal.Content>
      {showEditModal && (
        <LegacyModal
          wide
          data-testid="action-editor-modal"
          onClose={closeEditModal}
        >
          <ActionCreator
            modelId={action.model_id}
            databaseId={action.database_id}
            actionId={action.id}
            onClose={closeEditModal}
            onSubmit={onChangeAction}
          />
        </LegacyModal>
      )}
    </>
  );
}

const EmptyActionState = () => (
  <EmptyState className={CS.p3} message={t`Select an action to get started`} />
);
