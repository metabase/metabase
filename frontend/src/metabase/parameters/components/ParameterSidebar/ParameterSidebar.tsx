import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio";
import Sidebar from "metabase/dashboard/components/Sidebar";
import { Parameter } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import { canUseLinkedFilters } from "../../utils/linked-filters";
import ParameterSettings from "../ParameterSettings";
import ParameterLinkedFilters from "../ParameterLinkedFilters";
import { SidebarBody, SidebarHeader } from "./ParameterSidebar.styled";

export interface ParameterSidebarProps {
  parameter: Parameter;
  otherParameters: UiParameter[];
  onChangeParameter: (parameter: Parameter) => void;
  onRemoveParameter: (parameterId: string) => void;
  onShowAddParameterPopover: () => void;
  onClose: () => void;
}

const ParameterSidebar = ({
  parameter,
  otherParameters,
  onChangeParameter,
  onRemoveParameter,
  onShowAddParameterPopover,
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
    onRemoveParameter(originalParameter.id);
    onClose();
  }, [originalParameter, onRemoveParameter, onClose]);

  const handleCancel = useCallback(() => {
    onChangeParameter(originalParameter);
    onClose();
  }, [originalParameter, onChangeParameter, onClose]);

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
            onChangeParameter={onChangeParameter}
            onRemoveParameter={handleRemove}
          />
        ) : (
          <ParameterLinkedFilters
            parameter={parameter}
            otherParameters={otherParameters}
            onChangeParameter={onChangeParameter}
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

export default ParameterSidebar;
