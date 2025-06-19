import { useMemo } from "react";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import LegacyButton from "metabase/core/components/Button/Button";
import CS from "metabase/css/core/index.css";
import { Button, Divider, Icon, Modal, Stack } from "metabase/ui";
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
  onClose: () => void;
}

export function ActionDashcardSettings({
  action,
  dashboard,
  dashcard,
  onChooseNewAction,
  onClose,
}: Props) {
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

  return (
    <Modal.Content>
      <Modal.Header p="2rem 1.5rem 0.5rem 1.2rem">
        <Button
          leftSection={<Icon name="chevronleft" />}
          color="text-dark"
          variant="subtle"
          size="compact-md"
          onClick={onChooseNewAction}
        >{t`Choose a new action`}</Button>
        <Modal.CloseButton />
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
  );
}

const EmptyActionState = () => (
  <EmptyState className={CS.p3} message={t`Select an action to get started`} />
);
