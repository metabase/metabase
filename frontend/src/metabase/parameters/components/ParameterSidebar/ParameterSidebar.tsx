import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { getEmbeddedParameterVisibility } from "metabase/dashboard/selectors";
import { slugify } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import type { IconName } from "metabase/ui";
import { Tabs, Text } from "metabase/ui";
import { isFilterParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import { parameterHasNoDisplayValue } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Parameter,
  ParameterId,
  TemporalUnit,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";

import { canUseLinkedFilters } from "../../utils/linked-filters";
import { ParameterLinkedFilters } from "../ParameterLinkedFilters";
import { ParameterSettings } from "../ParameterSettings";

export interface ParameterSidebarProps {
  parameter: Parameter;
  otherParameters: Parameter[];
  hasMapping: boolean;
  onChangeName: (parameterId: ParameterId, name: string) => void;
  onChangeType: (
    parameterId: ParameterId,
    nextType: string,
    nextSectionId: string,
  ) => void;
  onChangeDefaultValue: (parameterId: ParameterId, value: unknown) => void;
  onChangeIsMultiSelect: (
    parameterId: ParameterId,
    isMultiSelect: boolean,
  ) => void;
  onChangeQueryType: (
    parameterId: ParameterId,
    sourceType: ValuesQueryType,
  ) => void;
  onChangeSourceType: (
    parameterId: ParameterId,
    sourceType: ValuesSourceType,
  ) => void;
  onChangeSourceConfig: (
    parameterId: ParameterId,
    sourceOptions: ValuesSourceConfig,
  ) => void;
  onChangeFilteringParameters: (
    parameterId: ParameterId,
    filteringParameters: string[],
  ) => void;
  onChangeRequired: (parameterId: ParameterId, value: boolean) => void;
  onChangeTemporalUnits: (
    parameterId: ParameterId,
    temporalUnits: TemporalUnit[],
  ) => void;
  onRemoveParameter: (parameterId: ParameterId) => void;
  onShowAddParameterPopover: () => void;
  onClose: () => void;
}

export const ParameterSidebar = ({
  parameter,
  otherParameters,
  onChangeName,
  onChangeType,
  onChangeDefaultValue,
  onChangeIsMultiSelect,
  onChangeQueryType,
  onChangeSourceType,
  onChangeSourceConfig,
  onChangeFilteringParameters,
  onChangeRequired,
  onChangeTemporalUnits,
  onRemoveParameter,
  onShowAddParameterPopover,
  onClose,
  hasMapping,
}: ParameterSidebarProps): JSX.Element => {
  const parameterId = parameter.id;
  const tabs = useMemo(() => getTabs(parameter), [parameter]);
  const [tab, setTab] = useState<"filters" | "settings">(tabs[0].value);
  const prevParameterId = usePrevious(parameterId);

  const embeddedParameterVisibility = useSelector(state =>
    getEmbeddedParameterVisibility(state, parameter.slug),
  );

  useEffect(() => {
    if (prevParameterId !== parameterId) {
      setTab(tabs[0].value);
    }
  }, [parameterId, prevParameterId, tabs]);

  const missingRequiredDefault =
    parameter.required && parameterHasNoDisplayValue(parameter.default);

  const handleNameChange = useCallback(
    (name: string) => {
      onChangeName(parameterId, name);
    },
    [parameterId, onChangeName],
  );

  const handleTypeChange = useCallback(
    (type: string, sectionId: string) => {
      onChangeType(parameterId, type, sectionId);
    },
    [parameterId, onChangeType],
  );

  const handleDefaultValueChange = useCallback(
    (value: unknown) => {
      onChangeDefaultValue(parameterId, value);
    },
    [parameterId, onChangeDefaultValue],
  );

  const handleIsMultiSelectChange = useCallback(
    (isMultiSelect: boolean) => {
      onChangeIsMultiSelect(parameterId, isMultiSelect);
    },
    [parameterId, onChangeIsMultiSelect],
  );

  const handleQueryTypeChange = useCallback(
    (queryType: ValuesQueryType) => {
      onChangeQueryType(parameterId, queryType);
    },
    [parameterId, onChangeQueryType],
  );

  const handleSourceTypeChange = useCallback(
    (sourceType: ValuesSourceType) => {
      onChangeSourceType(parameterId, sourceType);
    },
    [parameterId, onChangeSourceType],
  );

  const handleSourceConfigChange = useCallback(
    (sourceOptions: ValuesSourceConfig) => {
      onChangeSourceConfig(parameterId, sourceOptions);
    },
    [parameterId, onChangeSourceConfig],
  );

  const handleFilteringParametersChange = useCallback(
    (filteringParameters: ParameterId[]) => {
      onChangeFilteringParameters(parameterId, filteringParameters);
    },
    [parameterId, onChangeFilteringParameters],
  );

  const handleRemove = useCallback(() => {
    onRemoveParameter(parameterId);
    onClose();
  }, [parameterId, onRemoveParameter, onClose]);

  const isParameterSlugUsed = useCallback(
    (value: string) =>
      otherParameters.some(parameter => parameter.slug === slugify(value)),
    [otherParameters],
  );

  const handleChangeRequired = (value: boolean) =>
    onChangeRequired(parameterId, value);

  const handleChangeTemporalUnits = (temporalUnits: TemporalUnit[]) =>
    onChangeTemporalUnits(parameterId, temporalUnits);

  const handleTabChange = (newTab: string | null) => {
    if (!newTab || (newTab !== "settings" && newTab !== "filters")) {
      return;
    }

    return setTab(newTab);
  };

  return (
    <Sidebar
      onClose={onClose}
      isCloseDisabled={missingRequiredDefault}
      closeTooltip={
        missingRequiredDefault
          ? t`The parameter requires a default value but none was provided.`
          : undefined
      }
      onRemove={handleRemove}
      data-testid="dashboard-parameter-sidebar"
    >
      <Tabs radius={0} value={tab} onTabChange={handleTabChange}>
        <Tabs.List grow>
          {tabs.length > 1 &&
            tabs.map(tab => {
              return (
                <Tabs.Tab
                  pl={0}
                  pr={0}
                  pt="md"
                  pb="md"
                  value={tab.value}
                  key={tab.value}
                >
                  {tab.name}
                </Tabs.Tab>
              );
            })}
          {tabs.length === 1 && (
            <Text
              lh="1rem"
              pb="md"
              pt="md"
              fz="md"
              fw="bold"
              w="100%"
              ta="center"
            >
              {tabs[0].name}
            </Text>
          )}
        </Tabs.List>

        <Tabs.Panel pr="md" pl="md" value="settings" key="settings">
          <ParameterSettings
            parameter={parameter}
            embeddedParameterVisibility={embeddedParameterVisibility}
            isParameterSlugUsed={isParameterSlugUsed}
            onChangeName={handleNameChange}
            onChangeType={handleTypeChange}
            onChangeDefaultValue={handleDefaultValueChange}
            onChangeIsMultiSelect={handleIsMultiSelectChange}
            onChangeQueryType={handleQueryTypeChange}
            onChangeSourceType={handleSourceTypeChange}
            onChangeSourceConfig={handleSourceConfigChange}
            onChangeRequired={handleChangeRequired}
            onChangeTemporalUnits={handleChangeTemporalUnits}
            hasMapping={hasMapping}
          />
        </Tabs.Panel>

        <Tabs.Panel pr="md" pl="md" value="filters" key="filters">
          <ParameterLinkedFilters
            parameter={parameter}
            otherParameters={otherParameters}
            onChangeFilteringParameters={handleFilteringParametersChange}
            onShowAddParameterPopover={onShowAddParameterPopover}
          />
        </Tabs.Panel>
      </Tabs>
    </Sidebar>
  );
};

type Tab = {
  name: string;
  value: "settings" | "filters";
  icon: IconName;
};

const getTabs = (parameter: Parameter): Tab[] => {
  const tabs: Tab[] = [];

  tabs.push({
    name: isFilterParameter(parameter) ? t`Filter settings` : t`Settings`,
    value: "settings",
    icon: "gear",
  });

  if (canUseLinkedFilters(parameter)) {
    tabs.push({
      name: t`Linked filters`,
      value: "filters",
      icon: "link",
    });
  }

  return tabs;
};
