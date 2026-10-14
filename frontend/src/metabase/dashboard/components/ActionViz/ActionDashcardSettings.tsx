import { useMemo } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import CS from "metabase/css/core/index.css";
import { setActionForDashcard } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/redux";
import { Box, Button, Flex, Stack, Title } from "metabase/ui";
import type {
  ActionDashboardCard,
  Dashboard,
  WritebackAction,
} from "metabase-types/api";

import {
  ActionParameterMappingForm,
  getTargetKey,
} from "./ActionParameterMapping";
import { ConnectedActionPicker } from "./ActionPicker";
import { ExplainerText } from "./ExplainerText";
import {
  getParameterDefaultValue,
  isParameterHidden,
  isParameterRequired,
} from "./utils";

interface Props {
  dashboard: Dashboard;
  dashcard: ActionDashboardCard;
  onClose: () => void;
}

export function ActionDashcardSettings({
  dashboard,
  dashcard,
  onClose,
}: Props) {
  const dispatch = useDispatch();
  const action = dashcard.action;

  const setAction = (newAction: WritebackAction) => {
    dispatch(setActionForDashcard(dashcard, newAction));
  };

  const hasParameters = !!action?.parameters?.length;
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

  const isFormInvalid =
    action != null &&
    action.parameters?.some((actionParameter) => {
      const isHidden = isParameterHidden(action, actionParameter);
      const isRequired = isParameterRequired(action, actionParameter);
      const isParameterMapped =
        currentMappings[getTargetKey(actionParameter)] != null;
      const defaultValue = getParameterDefaultValue(action, actionParameter);
      const hasDefaultValue = defaultValue != null;

      return isHidden && isRequired && !isParameterMapped && !hasDefaultValue;
    });

  return (
    // The dialog is a flex column, so a zero minimum lets the panel shrink to the dialog cap
    <Flex
      className={CS.overflowHidden}
      mih={0}
      miw="50rem"
      data-testid="action-dashcard-settings"
    >
      <Box className={CS.overflowYAuto} w="20rem" pl="xxl" py="xxl">
        <h4 className={CS.pb2}>{t`Action Library`}</h4>
        <ConnectedActionPicker currentAction={action} onClick={setAction} />
      </Box>
      <Stack className={CS.borderLeft} gap={0} flex={1} maw="30rem" pt="xxl">
        {action && hasParameters && (
          <>
            <Title order={2} size="h3" lh="normal" pb="sm" px="xxl">
              {t`Where should the values for '${action.name}' come from?`}
            </Title>
            <ExplainerText />
          </>
        )}
        <Stack
          className={CS.overflowYAuto}
          gap={0}
          flex={1}
          pt="sm"
          pb="xxl"
          px="xxl"
        >
          {action ? (
            <ActionParameterMappingForm
              dashcard={dashcard}
              dashboard={dashboard}
              action={action}
              currentMappings={currentMappings}
            />
          ) : (
            <EmptyActionState />
          )}
        </Stack>
        <Flex
          className={CS.borderTop}
          flex="0 0 auto"
          justify="flex-end"
          gap="lg"
          p="lg"
        >
          <Button variant="filled" onClick={onClose} disabled={isFormInvalid}>
            {t`Done`}
          </Button>
        </Flex>
      </Stack>
    </Flex>
  );
}

const EmptyActionState = () => (
  <EmptyState className={CS.p3} message={t`Select an action to get started`} />
);
