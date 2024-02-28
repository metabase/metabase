import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import Radio from "metabase/core/components/Radio";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { slugify } from "metabase/lib/formatting";
import type { EmbeddingParameterVisibility } from "metabase/public/lib/types";
import { parameterHasNoDisplayValue } from "metabase-lib/parameters/utils/parameter-values";
import type {
  Parameter,
  ParameterId,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";

import { canUseLinkedFilters } from "../../utils/linked-filters";
import ParameterLinkedFilters from "../ParameterLinkedFilters";
import { ParameterSettings } from "../ParameterSettings";

import { SidebarBody, SidebarHeader } from "./ParameterSidebar.styled";

export interface ParameterSidebarProps {
  parameter: Parameter;
  otherParameters: Parameter[];
  onChangeName: (parameterId: ParameterId, name: string) => void;
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
  onRemoveParameter: (parameterId: ParameterId) => void;
  onShowAddParameterPopover: () => void;
  onClose: () => void;
  getEmbeddedParameterVisibility: (
    slug: string,
  ) => EmbeddingParameterVisibility | null;
}

export const ParameterSidebar = ({
  parameter,
  otherParameters,
  onChangeName,
  onChangeDefaultValue,
  onChangeIsMultiSelect,
  onChangeQueryType,
  onChangeSourceType,
  onChangeSourceConfig,
  onChangeFilteringParameters,
  onChangeRequired,
  onRemoveParameter,
  onShowAddParameterPopover,
  onClose,
  getEmbeddedParameterVisibility,
}: ParameterSidebarProps): JSX.Element => {
  const parameterId = parameter.id;
  const tabs = useMemo(() => getTabs(parameter), [parameter]);
  const [tab, setTab] = useState(tabs[0].value);

  const missingRequiredDefault =
    parameter.required && parameterHasNoDisplayValue(parameter.default);

  const handleNameChange = useCallback(
    (name: string) => {
      onChangeName(parameterId, name);
    },
    [parameterId, onChangeName],
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
      <SidebarHeader>
        <Radio
          value={tab}
          options={tabs}
          variant="underlined"
          onChange={setTab}
        />
      </SidebarHeader>
      <SidebarBody>
        {tab === "settings" ? (
          <ParameterSettings
            parameter={parameter}
            embeddedParameterVisibility={getEmbeddedParameterVisibility(
              parameter.slug,
            )}
            isParameterSlugUsed={isParameterSlugUsed}
            onChangeName={handleNameChange}
            onChangeDefaultValue={handleDefaultValueChange}
            onChangeIsMultiSelect={handleIsMultiSelectChange}
            onChangeQueryType={handleQueryTypeChange}
            onChangeSourceType={handleSourceTypeChange}
            onChangeSourceConfig={handleSourceConfigChange}
            onChangeRequired={handleChangeRequired}
          />
        ) : (
          <ParameterLinkedFilters
            parameter={parameter}
            otherParameters={otherParameters}
            onChangeFilteringParameters={handleFilteringParametersChange}
            onShowAddParameterPopover={onShowAddParameterPopover}
          />
        )}
      </SidebarBody>
    </Sidebar>
  );
};

const getTabs = (parameter: Parameter) => {
  const tabs = [{ value: "settings", name: t`Settings`, icon: "gear" }];

  if (canUseLinkedFilters(parameter)) {
    tabs.push({ value: "filters", name: t`Linked filters`, icon: "link" });
  }

  return tabs;
};
