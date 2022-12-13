import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio";
import Sidebar from "metabase/dashboard/components/Sidebar";
import { Parameter } from "metabase-types/api";
import { canUseLinkedFilters } from "../../utils/linked-filters";
import ParameterSettings from "../ParameterSettings";
import ParameterLinkedFilters from "../ParameterLinkedFilters";
import { SidebarBody, SidebarHeader } from "./ParameterSidebar.styled";

export interface ParameterSidebarProps {
  parameter: Parameter;
  otherParameters: Parameter[];
  onChange: (parameterId: string, parameter: Parameter) => void;
  onChangeName: (parameterId: string, name: string) => void;
  onChangeDefaultValue: (parameterId: string, value: unknown) => void;
  onChangeIsMultiSelect: (parameterId: string, isMultiSelect: boolean) => void;
  onChangeFilteringParameters: (
    parameterId: string,
    filteringParameters: string[],
  ) => void;
  onShowAddPopover: () => void;
  onRemove: (parameterId: string) => void;
  onClose: () => void;
}

const ParameterSidebar = ({
  parameter,
  otherParameters,
  onChange,
  onChangeName,
  onChangeDefaultValue,
  onChangeIsMultiSelect,
  onChangeFilteringParameters,
  onShowAddPopover,
  onRemove,
  onClose,
}: ParameterSidebarProps): JSX.Element => {
  const tabs = useMemo(() => getTabs(parameter), [parameter]);
  const [tab, setTab] = useState(tabs[0].value);
  const [originalParameter, setOriginalParameter] = useState(parameter);

  useLayoutEffect(() => {
    if (parameter.id !== originalParameter.id) {
      setOriginalParameter(parameter);
    }
  }, [parameter, originalParameter]);

  const handleRemove = useCallback(() => {
    onRemove(originalParameter.id);
    onClose();
  }, [originalParameter, onRemove, onClose]);

  const handleCancel = useCallback(() => {
    onChange(originalParameter.id, originalParameter);
    onClose();
  }, [originalParameter, onChange, onClose]);

  return (
    <Sidebar onCancel={handleCancel} onClose={onClose}>
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
            onRemove={handleRemove}
          />
        ) : (
          <ParameterLinkedFilters
            parameter={parameter}
            otherParameters={otherParameters}
            onChangeFilteringParameters={onChangeFilteringParameters}
            onShowAddPopover={onShowAddPopover}
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

export default ParameterSidebar;
