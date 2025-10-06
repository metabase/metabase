import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  getEditingParameterInlineDashcard,
  getEmbeddedParameterVisibility,
} from "metabase/dashboard/selectors";
import { slugify } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import { hasMapping } from "metabase/parameters/utils/dashboards";
import type { IconName } from "metabase/ui";
import { Tabs } from "metabase/ui";
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

export const ParameterSidebar = (): JSX.Element | null => {
  const {
    dashboard,
    parameters,
    editingParameter,
    closeSidebar,
    removeParameter,
    setParameterName,
    setParameterType,
    setParameterDefaultValue,
    setParameterIsMultiSelect,
    setParameterQueryType,
    setParameterSourceType,
    setParameterSourceConfig,
    setParameterFilteringParameters,
    setParameterRequired,
    setParameterTemporalUnits,
  } = useDashboardContext();

  const editingParameterInlineDashcard = useSelector(
    getEditingParameterInlineDashcard,
  );

  const parameter = useMemo(
    () =>
      editingParameter
        ? parameters.find((p) => p.id === editingParameter.id)
        : null,
    [editingParameter, parameters],
  );
  const otherParameters = useMemo(
    () => parameters.filter((p) => p.id !== editingParameter?.id),
    [editingParameter?.id, parameters],
  );

  const parameterId = parameter?.id;
  const tabs = useMemo(
    () => (parameter ? getTabs(parameter) : []),
    [parameter],
  );
  const [tab, setTab] = useState<"filters" | "settings">(
    tabs[0]?.value || "settings",
  );
  const prevParameterId = usePrevious(parameterId);

  const embeddedParameterVisibility = useSelector((state) =>
    parameter ? getEmbeddedParameterVisibility(state, parameter.slug) : null,
  );

  useEffect(() => {
    if (prevParameterId !== parameterId && tabs.length > 0) {
      setTab(tabs[0].value);
    }
  }, [parameterId, prevParameterId, tabs]);

  const handleNameChange = useCallback(
    (name: string) => {
      if (parameterId) {
        setParameterName(parameterId, name);
      }
    },
    [parameterId, setParameterName],
  );

  const handleTypeChange = useCallback(
    (type: string, sectionId: string) => {
      if (parameterId) {
        setParameterType(parameterId, type, sectionId);
      }
    },
    [parameterId, setParameterType],
  );

  const handleDefaultValueChange = useCallback(
    (value: unknown) => {
      if (parameterId) {
        setParameterDefaultValue(parameterId, value);
      }
    },
    [parameterId, setParameterDefaultValue],
  );

  const handleIsMultiSelectChange = useCallback(
    (isMultiSelect: boolean) => {
      if (parameterId) {
        setParameterIsMultiSelect(parameterId, isMultiSelect);
      }
    },
    [parameterId, setParameterIsMultiSelect],
  );

  const handleQueryTypeChange = useCallback(
    (queryType: ValuesQueryType) => {
      if (parameterId) {
        setParameterQueryType(parameterId, queryType);
      }
    },
    [parameterId, setParameterQueryType],
  );

  const handleSourceTypeChange = useCallback(
    (sourceType: ValuesSourceType) => {
      if (parameterId) {
        setParameterSourceType(parameterId, sourceType);
      }
    },
    [parameterId, setParameterSourceType],
  );

  const handleSourceConfigChange = useCallback(
    (sourceOptions: ValuesSourceConfig) => {
      if (parameterId) {
        setParameterSourceConfig(parameterId, sourceOptions);
      }
    },
    [parameterId, setParameterSourceConfig],
  );

  const handleFilteringParametersChange = useCallback(
    (filteringParameters: ParameterId[]) => {
      if (parameterId) {
        setParameterFilteringParameters(parameterId, filteringParameters);
      }
    },
    [parameterId, setParameterFilteringParameters],
  );

  const handleRemove = useCallback(() => {
    if (parameterId) {
      removeParameter(parameterId);
      closeSidebar();
    }
  }, [parameterId, removeParameter, closeSidebar]);

  const isParameterSlugUsed = useCallback(
    (value: string) =>
      otherParameters.some((parameter) => parameter.slug === slugify(value)),
    [otherParameters],
  );

  const handleChangeRequired = (value: boolean) => {
    if (parameterId) {
      setParameterRequired(parameterId, value);
    }
  };

  const handleChangeTemporalUnits = (temporalUnits: TemporalUnit[]) => {
    if (parameterId) {
      setParameterTemporalUnits(parameterId, temporalUnits);
    }
  };

  const handleTabChange = (newTab: string | null) => {
    if (!newTab || (newTab !== "settings" && newTab !== "filters")) {
      return;
    }

    return setTab(newTab);
  };

  if (!dashboard || !editingParameter || !parameter) {
    return null;
  }

  const missingRequiredDefault =
    parameter.required && parameterHasNoDisplayValue(parameter.default);
  const parameterHasMapping = hasMapping(parameter, dashboard);

  return (
    <Sidebar
      onClose={closeSidebar}
      isCloseDisabled={missingRequiredDefault}
      closeTooltip={
        missingRequiredDefault
          ? t`The parameter requires a default value but none was provided.`
          : undefined
      }
      onRemove={handleRemove}
      data-testid="dashboard-parameter-sidebar"
    >
      <Tabs radius={0} value={tab} onChange={handleTabChange}>
        {tabs.length > 1 && (
          <Tabs.List grow>
            {tabs.map((tab) => (
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
            ))}
          </Tabs.List>
        )}

        <Tabs.Panel pr="md" pl="md" value="settings" key="settings">
          <ParameterSettings
            editingParameterInlineDashcard={editingParameterInlineDashcard}
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
            hasMapping={parameterHasMapping}
          />
        </Tabs.Panel>

        <Tabs.Panel pr="md" pl="md" value="filters" key="filters">
          <ParameterLinkedFilters
            parameter={parameter}
            otherParameters={otherParameters}
            onChangeFilteringParameters={handleFilteringParametersChange}
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
    name: isFilterParameter(parameter)
      ? t`Filter settings`
      : t`Parameter settings`,
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
