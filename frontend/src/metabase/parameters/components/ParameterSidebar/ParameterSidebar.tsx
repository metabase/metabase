import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio";
import Sidebar from "metabase/dashboard/components/Sidebar";
import { Parameter } from "metabase-types/api";
import { canUseLinkedFilters } from "../../utils/linked-filters";
import ParameterSettings from "../ParameterSettings";
import { SidebarBody, SidebarHeader } from "./ParameterSidebar.styled";

export interface ParameterSidebarProps {
  parameter: Parameter;
  onParameterChange: (parameter: Parameter) => void;
  onNameChange: (name: string) => void;
  onDefaultValueChange: (value: unknown) => void;
  onMultiSelectChange: (isMultiSelect: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}

const ParameterSidebar = ({
  parameter,
  onParameterChange,
  onNameChange,
  onDefaultValueChange,
  onMultiSelectChange,
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

  const handleCancel = useCallback(() => {
    onParameterChange(originalParameter);
    onClose();
  }, [originalParameter, onParameterChange, onClose]);

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
            onNameChange={onNameChange}
            onDefaultValueChange={onDefaultValueChange}
            onMultiSelectChange={onMultiSelectChange}
            onRemove={onRemove}
          />
        ) : null}
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
