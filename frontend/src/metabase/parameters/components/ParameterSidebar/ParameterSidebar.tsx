import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio";
import Sidebar from "metabase/dashboard/components/Sidebar";
import { UiParameter } from "metabase-lib/parameters/types";
import { canUseLinkedFilters } from "../../utils/linked-filters";
import ParameterSettings from "../ParameterSettings";
import ParameterLinkedFilters from "../ParameterLinkedFilters";
import { SidebarBody, SidebarHeader } from "./ParameterSidebar.styled";

export interface ParameterSidebarProps {
  parameter: UiParameter;
  otherParameters: UiParameter[];
  onChangeName: (parameterId: string, name: string) => void;
  onChangeDefaultValue: (parameterId: string, value: unknown) => void;
  onChangeIsMultiSelect: (parameterId: string, isMultiSelect: boolean) => void;
  onChangeFilteringParameters: (
    parameterId: string,
    filteringParameters: string[],
  ) => void;
  onRemoveParameter: (parameterId: string) => void;
  onShowAddParameterPopover: () => void;
  onClose: () => void;
}

const ParameterSidebar = ({
  parameter,
  otherParameters,
  onChangeName,
  onChangeDefaultValue,
  onChangeIsMultiSelect,
  onChangeFilteringParameters,
  onRemoveParameter,
  onShowAddParameterPopover,
  onClose,
}: ParameterSidebarProps): JSX.Element => {
  const tabs = useMemo(() => getTabs(parameter), [parameter]);
  const [tab, setTab] = useState(tabs[0].value);

  const handleRemove = useCallback(
    (parameterId: string) => {
      onRemoveParameter(parameterId);
      onClose();
    },
    [onRemoveParameter, onClose],
  );

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
            onChangeName={onChangeName}
            onChangeDefaultValue={onChangeDefaultValue}
            onChangeIsMultiSelect={onChangeIsMultiSelect}
            onRemoveParameter={handleRemove}
          />
        ) : (
          <ParameterLinkedFilters
            parameter={parameter}
            otherParameters={otherParameters}
            onChangeFilteringParameters={onChangeFilteringParameters}
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
