import React from "react";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";

const AddClauseWidget = ({ color, children }) => (
  <PopoverWithTrigger
    triggerElement={
      <Icon name="add" size={20} className="p1" style={{ color }} />
    }
    triggerClasses="flex-align-right flex align-center"
  >
    {children}
  </PopoverWithTrigger>
);

export default AddClauseWidget;
