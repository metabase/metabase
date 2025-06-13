import { useMemo } from "react";
import { t } from "ttag";

import {
  getParameterDefaultValue,
  isParameterHidden,
  isParameterRequired,
} from "metabase/actions/components/ActionViz/utils";
import type { ActionItem } from "metabase/common/components/DataPicker";
import { TableOrModelActionPicker } from "metabase/common/components/TableOrModelActionPicker";
import Button from "metabase/core/components/Button";
import { setActionForDashcard } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { Stack } from "metabase/ui";
// TODO: Remove this once we have a proper API for actions.
// eslint-disable-next-line no-restricted-imports
import { useGetActionsQuery } from "metabase-enterprise/api";
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

interface Props {
  dashboard: Dashboard;
  dashcard: ActionDashboardCard;
  onClose: () => void;
}

export const ActionDashcardSettingsNew = ({
  dashboard,
  dashcard,
  onClose,
}: Props) => {
  const action = dashcard.action;
  const { data: actions } = useGetActionsQuery();
  const hasParameters = !!action?.parameters?.length;

  const dispatch = useDispatch();

  const selectedActionItem = useMemo(
    () =>
      action
        ? {
            id: action.id,
            name: action.name,
            model: "action" as const,
          }
        : undefined,
    [action],
  );

  const setAction = (newActionItem: ActionItem | undefined) => {
    const action = actions?.find(({ id }) => id === newActionItem?.id);

    if (action) {
      dispatch(setActionForDashcard(dashcard, action as WritebackAction));
    }
  };

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
    <TableOrModelActionPicker
      value={selectedActionItem}
      onChange={setAction}
      onClose={onClose}
    >
      <Stack>
        {action && (
          <>
            {hasParameters && (
              <>
                <ActionSettingsHeader>
                  {t`Where should the values for '${action.name}' come from?`}
                </ActionSettingsHeader>
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
            <ModalActions>
              <Button primary onClick={onClose} disabled={isFormInvalid}>
                {t`Done`}
              </Button>
            </ModalActions>
          </>
        )}
      </Stack>
    </TableOrModelActionPicker>
  );
};
