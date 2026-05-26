import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";
import { c, msgid, t } from "ttag";

import { skipToken, useListSubscriptionsQuery } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Sidebar } from "metabase/common/components/Sidebar";
import { hasMapping } from "metabase/parameters/utils/dashboards";
import { canUseLinkedFilters } from "metabase/parameters/utils/linked-filters";
import { useSelector } from "metabase/redux";
import { Tabs } from "metabase/ui";
import { slugify } from "metabase/visualizations/lib/formatting";
import { isFilterParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import { parameterHasNoDisplayValue } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  IconName,
  Parameter,
  ParameterId,
  TemporalUnit,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";

import { useDashboardContext } from "../../context";
import {
  getEditingParameterInlineDashcard,
  getEmbeddedParameterVisibility,
} from "../../selectors";
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
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  const prevParameterId = usePrevious(parameterId);

  // Active dashboard subscriptions may bind values to this parameter. Deleting
  // the filter will archive any such subscription and email its recipients,
  // so we warn before letting that happen.
  const { data: subscriptions } = useListSubscriptionsQuery(
    dashboard ? { dashboard_id: dashboard.id, archived: false } : skipToken,
  );
  const areSubscriptionsLoaded = subscriptions !== undefined;
  const affectedSubscriptions = useMemo(
    () =>
      parameterId && subscriptions
        ? subscriptions.filter(
            (subscription) =>
              !subscription.archived &&
              subscription.parameters.some((p) => p.id === parameterId),
          )
        : [],
    [parameterId, subscriptions],
  );

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

  const performRemove = useCallback(() => {
    if (parameterId) {
      removeParameter(parameterId);
      closeSidebar();
    }
  }, [parameterId, removeParameter, closeSidebar]);

  const handleRemove = useCallback(() => {
    if (!parameterId) {
      return;
    }
    if (affectedSubscriptions.length > 0) {
      setIsRemoveConfirmOpen(true);
    } else {
      performRemove();
    }
  }, [parameterId, affectedSubscriptions.length, performRemove]);

  const handleConfirmRemove = useCallback(() => {
    setIsRemoveConfirmOpen(false);
    performRemove();
  }, [performRemove]);

  const handleCancelRemove = useCallback(() => {
    setIsRemoveConfirmOpen(false);
  }, []);

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
      isRemoveDisabled={!areSubscriptionsLoaded}
      removeTooltip={
        !areSubscriptionsLoaded ? t`Checking subscriptions…` : undefined
      }
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
      <ConfirmModal
        opened={isRemoveConfirmOpen}
        title={t`Remove this filter?`}
        message={c(
          "Warning shown when deleting a dashboard filter that has active subscriptions referencing it. The number can be 1 or more.",
        ).ngettext(
          msgid`${affectedSubscriptions.length} active subscription uses this filter. Removing it will archive the subscription and email its recipients.`,
          `${affectedSubscriptions.length} active subscriptions use this filter. Removing it will archive these subscriptions and email their recipients.`,
          affectedSubscriptions.length,
        )}
        confirmButtonText={t`Remove filter`}
        closeButtonText={t`Cancel`}
        onConfirm={handleConfirmRemove}
        onClose={handleCancelRemove}
      />
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
