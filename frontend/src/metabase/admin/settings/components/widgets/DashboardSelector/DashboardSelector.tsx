import React from "react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger/PopoverWithTrigger";
import DashboardPicker from "metabase/containers/DashboardPicker";
import Dashboards from "metabase/entities/dashboards";

import { Dashboard } from "metabase-types/api";
import { State } from "metabase-types/store";
import {
  DashboardPickerContainer,
  DashboardPickerButton,
} from "./DashboardSelector.styled";

interface DashboardSelectorProps {
  onChange: (value: string) => void;
  dashboard: Dashboard;
  setting?: {
    key: string;
    value: string | null;
    default?: string;
    placeholder?: string;
  };
  value?: string;
}

const DashboardSelector = ({ onChange, dashboard }: DashboardSelectorProps) => {
  return (
    <PopoverWithTrigger
      triggerElement={
        <DashboardPickerButton>
          {dashboard?.name || "I dunno"}
        </DashboardPickerButton>
      }
    >
      <DashboardPickerContainer>
        <DashboardPicker
          value={dashboard?.id}
          onChange={onChange}
          showScroll={false}
        />
      </DashboardPickerContainer>
    </PopoverWithTrigger>
  );
};

export default Dashboards.load({
  id: (state: State, props: DashboardSelectorProps) =>
    props.value || props.setting?.value,
})(DashboardSelector);
