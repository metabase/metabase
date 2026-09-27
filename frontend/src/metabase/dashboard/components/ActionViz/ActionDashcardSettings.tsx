import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import CS from "metabase/css/core/index.css";
import { setActionForDashcard } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/redux";
import { Box, Button, Flex } from "metabase/ui";
import type {
  ActionDashboardCard,
  Dashboard,
  WritebackAction,
} from "metabase-types/api";

import S from "./ActionDashcardSettings.module.css";
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
    <Flex
      className={S.wrapper}
      h="80vh"
      miw="50rem"
      data-testid="action-dashcard-settings"
    >
      <Box className={S.left} w="20rem" pl="xxl" py="xxl">
        <h4 className={CS.pb2}>{t`Action Library`}</h4>
        <ConnectedActionPicker currentAction={action} onClick={setAction} />
      </Box>
      <Flex
        className={S.right}
        direction="column"
        flex={1}
        maw="30rem"
        pt="xxl"
      >
        {action ? (
          <>
            {hasParameters && (
              <>
                <Box component="h2" fz="1.25rem" pb="sm" px="xxl">
                  {t`Where should the values for '${action.name}' come from?`}
                </Box>
                <ExplainerText />
              </>
            )}
            <ParameterMapperContainer>
              <ActionParameterMappingForm
                dashcard={dashcard}
                dashboard={dashboard}
                action={action}
                currentMappings={currentMappings}
              />
            </ParameterMapperContainer>
          </>
        ) : (
          <ParameterMapperContainer>
            <EmptyActionState />
          </ParameterMapperContainer>
        )}
        <Flex
          className={S.modalActions}
          flex="0 0 auto"
          justify="flex-end"
          gap="lg"
          p="lg"
        >
          <Button variant="filled" onClick={onClose} disabled={isFormInvalid}>
            {t`Done`}
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}

const ParameterMapperContainer = ({ children }: { children: ReactNode }) => (
  <Flex
    className={S.parameterMapperContainer}
    direction="column"
    flex={1}
    pt="sm"
    pb="xxl"
    px="xxl"
  >
    {children}
  </Flex>
);

const EmptyActionState = () => (
  <EmptyState className={CS.p3} message={t`Select an action to get started`} />
);
