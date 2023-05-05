import React from "react";
import { t } from "ttag";
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
  onChange: (value?: number | null) => void;
  dashboard: Dashboard;
  value?: string;
}

const DashboardSelector = ({ onChange, dashboard }: DashboardSelectorProps) => {
  return (
    <PopoverWithTrigger
      triggerElement={
        <DashboardPickerButton>
          {dashboard?.name || t`Select a Dashboard`}
        </DashboardPickerButton>
      }
    >
      <DashboardPickerContainer>
        <DashboardPicker value={dashboard?.id} onChange={onChange} />
      </DashboardPickerContainer>
    </PopoverWithTrigger>
  );
};

export default Dashboards.load({
  id: (state: State, props: DashboardSelectorProps) => props.value,
})(DashboardSelector);
