import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio";
import Sidebar from "metabase/dashboard/components/Sidebar";
import {
  ParameterId,
  ParameterSourceOptions,
  ParameterSourceType,
} from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import { canUseLinkedFilters } from "../../utils/linked-filters";
import ParameterSettings from "../ParameterSettings";
import ParameterLinkedFilters from "../ParameterLinkedFilters";
import { SidebarBody, SidebarHeader } from "./ParameterSidebar.styled";

export interface ParameterSidebarProps {
  parameter: UiParameter;
  otherParameters: UiParameter[];
  onChangeName: (parameterId: ParameterId, name: string) => void;
  onChangeDefaultValue: (parameterId: ParameterId, value: unknown) => void;
  onChangeIsMultiSelect: (
    parameterId: ParameterId,
    isMultiSelect: boolean,
  ) => void;
  onChangeSourceType: (
    parameterId: ParameterId,
    sourceType: ParameterSourceType,
  ) => void;
  onChangeSourceOptions: (
    parameterId: ParameterId,
    sourceOptions: ParameterSourceOptions,
  ) => void;
  onChangeFilteringParameters: (
    parameterId: ParameterId,
    filteringParameters: string[],
  ) => void;
  onRemoveParameter: (parameterId: ParameterId) => void;
  onShowAddParameterPopover: () => void;
  onClose: () => void;
}

const ParameterSidebar = ({
  parameter,
  otherParameters,
  onChangeName,
  onChangeDefaultValue,
  onChangeIsMultiSelect,
  onChangeSourceType,
  onChangeSourceOptions,
  onChangeFilteringParameters,
  onRemoveParameter,
  onShowAddParameterPopover,
  onClose,
}: ParameterSidebarProps): JSX.Element => {
  const parameterId = parameter.id;
  const tabs = useMemo(() => getTabs(parameter), [parameter]);
  const [tab, setTab] = useState(tabs[0].value);

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

  const handleSourceTypeChange = useCallback(
    (sourceType: ParameterSourceType) => {
      onChangeSourceType(parameterId, sourceType);
    },
    [parameterId, onChangeSourceType],
  );

  const handleSourceOptionsChange = useCallback(
    (sourceOptions: ParameterSourceOptions) => {
      onChangeSourceOptions(parameterId, sourceOptions);
    },
    [parameterId, onChangeSourceOptions],
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

  return (
    <Sidebar onClose={onClose}>
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
            onChangeName={handleNameChange}
            onChangeDefaultValue={handleDefaultValueChange}
            onChangeIsMultiSelect={handleIsMultiSelectChange}
            onChangeSourceType={handleSourceTypeChange}
            onChangeSourceOptions={handleSourceOptionsChange}
            onRemoveParameter={handleRemove}
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

const getTabs = (parameter: UiParameter) => {
  const tabs = [{ value: "settings", name: t`Settings`, icon: "gear" }];

  if (canUseLinkedFilters(parameter)) {
    tabs.push({ value: "filters", name: t`Linked filters`, icon: "link" });
  }

  return tabs;
};

export default ParameterSidebar;
