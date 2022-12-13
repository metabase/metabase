import React, { useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio";
import Sidebar from "metabase/dashboard/components/Sidebar";
import { Parameter } from "metabase-types/api";
import { canUseLinkedFilters } from "../../utils/linked-filters";
import ParameterSettings from "../ParameterSettings";
import { SidebarBody, SidebarHeader } from "./ParameterSidebar.styled";

export interface ParameterSidebarProps {
  parameter: Parameter;
  onNameChange: (name: string) => void;
  onDefaultValueChange: (value: unknown) => void;
  onMultiSelectChange: (isMultiSelect: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}

const ParameterSidebar = ({
  parameter,
  onNameChange,
  onDefaultValueChange,
  onMultiSelectChange,
  onRemove,
  onClose,
}: ParameterSidebarProps): JSX.Element => {
  const [tab, setTab] = useState("settings");
  const tabs = getTabs(parameter);

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
