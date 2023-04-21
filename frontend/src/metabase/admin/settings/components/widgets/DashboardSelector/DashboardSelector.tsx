import PopoverWithTrigger from "metabase/components/PopoverWithTrigger/PopoverWithTrigger";
import DashboardPicker from "metabase/containers/DashboardPicker";
import React from "react";
import Dashboards from "metabase/entities/dashboards";

import { DashboardPickerContainer, DashboardPickerButton } from "./DashboardSelector.styled";

const DashboardSelector = ({
  onChange,
  setting,
  dashboard
}) => {

  return (
    <PopoverWithTrigger
      triggerElement={
        <DashboardPickerButton>{dashboard?.name || "I dunno"}</DashboardPickerButton>
      }>
        <DashboardPickerContainer>
          <DashboardPicker onChange={onChange} showScroll={false}/>
        </DashboardPickerContainer>        
      </PopoverWithTrigger>
  )
}

export default Dashboards.load({
  id: (state, props) => props.setting.value
})(DashboardSelector)