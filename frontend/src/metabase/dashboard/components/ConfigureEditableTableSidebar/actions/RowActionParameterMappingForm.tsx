import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  isParameterHidden,
  isParameterRequired,
} from "metabase/actions/components/ActionViz/utils";
import { sortActionParams } from "metabase/actions/utils";
import EmptyState from "metabase/components/EmptyState";
import { Box, Select, Stack, Text, TextInput } from "metabase/ui";
import type { SelectData } from "metabase/ui/components/inputs/Select/Select";
import type {
  Field,
  FieldId,
  ParameterId,
  PartialRowActionFieldSettings,
  PartialRowActionFieldSettingsMap,
  RowActionFieldSourceType,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

import S from "./ConfigureEditableTableActions.module.css";
import { TableColumnsSelect } from "./TableColumnsSelect";

interface ActionParameterMappingProps {
  action: WritebackAction;
  currentMappingsMap: PartialRowActionFieldSettingsMap;
  tableColumns: Field[];
  onMappingsChange: (currentMappings: PartialRowActionFieldSettingsMap) => void;
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
    (newParameterSettings: PartialRowActionFieldSettings) => {
      const newParams: Record<ParameterId, PartialRowActionFieldSettings> = {
        ...currentMappingsMap,
      };

      newParams[newParameterSettings.parameterId] = newParameterSettings;

      onMappingsChange(newParams);
    },
    [currentMappingsMap, onMappingsChange],
  );

  return (
    <Stack gap="lg" mt="md">
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
    </Stack>
  );
};

interface ActionParameterMappingItemProps {
  action: WritebackAction;
  actionParameter: WritebackParameter;
  parameterSettings: PartialRowActionFieldSettings;
  tableColumns: Field[];
  onChange: (parameterSettings: PartialRowActionFieldSettings) => void;
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
  tableColumns,
  onChange,
}: ActionParameterMappingItemProps) => {
  const isRequired = isParameterRequired(action, actionParameter);
  const isHidden = isParameterHidden(action, actionParameter);

  const name = actionParameter.name ?? actionParameter.id;

  const handleSourceTypeChange = (newValue: RowActionFieldSourceType) => {
    onChange({
      parameterId: parameterSettings.parameterId,
      sourceType: newValue,
    });
  };

  const handleValueChange = (newValue: string) => {
    onChange({
      parameterId: parameterSettings.parameterId,
      sourceType: "constant",
      value: newValue,
    });
  };

  const handleColumnChange = (newValue: FieldId) => {
    onChange({
      parameterId: parameterSettings.parameterId,
      sourceType: parameterSettings.sourceType,
      sourceValueTarget: newValue,
    });
  };

  const options = getDefaultOptions();

  return (
    <Box
      data-testid={`parameter-form-section-${actionParameter.id}`}
      className={S.ParameterWidget}
    >
      <Text>
        {`${name}: ${getFieldFlagsCaption({ isRequired, isHidden })}`}
      </Text>
      <Select
        value={parameterSettings.sourceType}
        data={options}
        onChange={handleSourceTypeChange}
      />

      <Box mt="1rem">
        {parameterSettings.sourceType === "row-data" && (
          <TableColumnsSelect
            value={parameterSettings.sourceValueTarget}
            columns={tableColumns}
            onChange={handleColumnChange}
          />
        )}

        {parameterSettings.sourceType === "constant" && (
          <TextInput
            label={t`Value`}
            value={parameterSettings.value}
            onChange={(e) => handleValueChange(e.target.value)}
          />
        )}
      </Box>
    </Box>
  );
};

const getFieldFlagsCaption = ({
  isRequired,
  isHidden,
}: {
  isRequired: boolean;
  isHidden: boolean;
}) => {
  return [isRequired ? t`required` : "", isHidden ? t`hidden` : ""]
    .filter(Boolean)
    .join(", ");
};
