import React from "react";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";

const AddClauseEmptyState = ({ message, children }) => (
  <PopoverWithTrigger
    triggerElement={
      <div className="py1">
        <strong>{message}</strong>
      </div>
    }
    triggerClasses="flex-full flex layout-centered"
  >
    {children}
  </PopoverWithTrigger>
);

export default AddClauseEmptyState;
