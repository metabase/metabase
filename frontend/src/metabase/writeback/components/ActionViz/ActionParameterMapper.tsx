import React, { useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";
import Select from "metabase/core/components/Select";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import type {
  ActionDashboardCard,
  ActionParametersMapping,
  DataAppPage,
  WritebackParameter,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import type {
  ParameterTarget,
  ParameterId,
} from "metabase-types/types/Parameter";

import { setParameterMapping } from "metabase/dashboard/actions";

import {
  ActionParameterTriggerContainer,
  ParameterMapperContainer,
  ParameterFormSection,
  ParameterFormLabel,
} from "./ActionParameterMapper.styled";

interface ActionParameterMapperProps {
  dashcard: ActionDashboardCard;
  page: DataAppPage;
}

type ParamaterMappingFn = (
  parameterId: ParameterId,
  dashcardId: number,
  cardId: number,
  target: ParameterTarget,
) => void;

interface DispatchProps {
  setParameterMapping: ParamaterMappingFn;
}

const mapDispatchToProps = {
  setParameterMapping,
};

export const ActionParameterMapper = ({
  dashcard,
  page,
}: ActionParameterMapperProps) => {
  const actionParameters = dashcard?.action?.parameters ?? [];
  const dashboardParameters = page.parameters ?? [];

  if (!actionParameters.length || !dashboardParameters.length) {
    return null;
  }

  const isNewlyAddedDashcard = dashcard.id < 1;

  return (
    <TippyPopoverWithTrigger
      isInitiallyVisible={isNewlyAddedDashcard}
      placement="right"
      renderTrigger={({ onClick, visible }) => (
        <ActionParameterTriggerContainer onClick={onClick}>
          <Icon
            name="bolt"
            size={14}
            tooltip={t`Assign action paramter values`}
          />
        </ActionParameterTriggerContainer>
      )}
      popoverContent={
        <ConnectedActionParameterMappingForm dashcard={dashcard} page={page} />
      }
    />
  );
};

const getTargetKey = (param: WritebackParameter | ActionParametersMapping) =>
  JSON.stringify(param.target);

export const ActionParameterMappingForm = ({
  dashcard,
  page,
  setParameterMapping,
}: ActionParameterMapperProps & DispatchProps) => {
  const actionParameters = dashcard?.action?.parameters ?? [];
  const dashboardParameters = page.parameters ?? [];

  const currentMappings = Object.fromEntries(
    dashcard.parameter_mappings?.map(mapping => [
      getTargetKey(mapping),
      mapping.parameter_id,
    ]) ?? [],
  );

  const handleParameterChange = useCallback(
    (dashboardParameterId, target) => {
      if (dashcard.card?.id) {
        setParameterMapping(
          dashboardParameterId,
          dashcard.id,
          dashcard.card.id,
          target,
        );
      }
    },
    [dashcard, setParameterMapping],
  );

  return (
    <ParameterMapperContainer>
      <h4>{t`Connect to parameters`}</h4>
      {actionParameters.map((actionParam: WritebackParameter) => (
        <ParameterFormSection key={actionParam.id}>
          <ParameterFormLabel>
            {actionParam.name ?? actionParam.id}
          </ParameterFormLabel>
          <Select
            value={currentMappings[getTargetKey(actionParam)] ?? null}
            onChange={({
              target: { value: newParameterId },
            }: {
              target: { value: ParameterId };
            }) => handleParameterChange(newParameterId, actionParam.target)}
            options={[
              { name: t`Ask the user`, value: null },
              ...dashboardParameters.map(dashboardParam => ({
                key: dashboardParam.id,
                name: dashboardParam.name,
                value: dashboardParam.id,
              })),
            ]}
          />
        </ParameterFormSection>
      ))}
    </ParameterMapperContainer>
  );
};

const ConnectedActionParameterMappingForm = connect<
  unknown,
  DispatchProps,
  ActionParameterMapperProps,
  State
>(
  null,
  // Need to figure out how to properly type curried actions
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  mapDispatchToProps,
)(ActionParameterMappingForm);
