import { type ChangeEvent, useCallback, useMemo } from "react";
import { t } from "ttag";

import { ParameterFormLabel } from "metabase/actions/components/ActionViz/ActionParameterMapping.styled";
import { isParameterRequired } from "metabase/actions/components/ActionViz/utils";
import { sortActionParams } from "metabase/actions/utils";
import EmptyState from "metabase/components/EmptyState";
import { Box, Checkbox, Select } from "metabase/ui";
import type { SelectData } from "metabase/ui/components/inputs/Select/Select";
import type {
  Field,
  RowActionFieldFieldSettingsMap,
  RowActionFieldSettings,
  RowActionFieldSourceType,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

interface ActionParameterMappingProps {
  action: WritebackAction;
  currentMappingsMap: RowActionFieldFieldSettingsMap;
  tableColumns: Field[];
  onMappingsChange: (currentMappings: RowActionFieldFieldSettingsMap) => void;
}

export const RowActionParameterMappingForm = ({
  action,
  currentMappingsMap,
  tableColumns,
  onMappingsChange,
}: ActionParameterMappingProps) => {
  const sortedParameters = useMemo(() => {
    const actionParameters = action?.parameters ?? [];

    return actionParameters && action?.visualization_settings?.fields
      ? [...actionParameters].sort(
          sortActionParams(action?.visualization_settings),
        )
      : actionParameters || [];
  }, [action]);

  const handleParameterChange = useCallback(
    (newParameterSettings: RowActionFieldSettings) => {
      const newParams = { ...currentMappingsMap };

      newParams[newParameterSettings.parameterId] = newParameterSettings;

      onMappingsChange(newParams);
    },
    [currentMappingsMap, onMappingsChange],
  );

  return (
    <div>
      {sortedParameters.map((actionParameter: WritebackParameter) => {
        const parameterSettings = currentMappingsMap[actionParameter.id] || {
          parameterId: actionParameter.id,
          sourceType: "ask-user",
        };

        return (
          <ActionParameterMappingItem
            key={actionParameter.id}
            action={action}
            actionParameter={actionParameter}
            parameterSettings={parameterSettings}
            tableColumns={tableColumns}
            onChange={handleParameterChange}
          />
        );
      })}
      {sortedParameters.length === 0 && (
        <EmptyState message={t`This action has no parameters to map`} />
      )}
    </div>
  );
};

interface ActionParameterMappingItemProps {
  action: WritebackAction;
  actionParameter: WritebackParameter;
  parameterSettings: RowActionFieldSettings;
  tableColumns: Field[];
  onChange: (parameterSettings: RowActionFieldSettings) => void;
}

const getDefaultOptions = (): SelectData<RowActionFieldSourceType> => {
  return [
    {
      label: t`Ask the user`,
      value: "ask-user",
    },
    {
      label: t`Get data from a row`,
      value: "row-data",
    },
    {
      label: t`Use constant value`,
      value: "constant",
    },
  ];
};

export const ActionParameterMappingItem = ({
  action,
  actionParameter,
  parameterSettings,
  // tableColumns,
  onChange,
}: ActionParameterMappingItemProps) => {
  const isRequired = isParameterRequired(action, actionParameter);

  const name = actionParameter.name ?? actionParameter.id;

  const handleSourceTypeChange = (newValue: RowActionFieldSourceType) => {
    onChange({
      ...parameterSettings,
      sourceType: newValue,
    });
  };

  const handleHiddenChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...parameterSettings,
      hidden: e.target.checked,
    });
  };

  const options = getDefaultOptions();

  return (
    <Box data-testid={`parameter-form-section-${actionParameter.id}`} mt="1rem">
      <ParameterFormLabel error={false}>
        <span>{`${name}${isRequired ? t`: required` : ""}`}</span>
      </ParameterFormLabel>
      <Select
        value={parameterSettings.sourceType}
        data={options}
        onChange={handleSourceTypeChange}
      />

      {(parameterSettings.sourceType === "row-data" ||
        parameterSettings.sourceType === "constant") && (
        <Checkbox
          label={t`Is hidden`}
          checked={parameterSettings.hidden}
          onChange={handleHiddenChange}
        />
      )}
    </Box>
  );
};
