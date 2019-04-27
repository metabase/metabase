import React from "react";

import SidebarContent from "metabase/query_builder/components/view/SidebarContent";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";

const BreakoutSidebar = ({ question, index, onClose }) => {
  const query = question.query();
  return (
    <SidebarContent onClose={onClose}>
      <BreakoutPopover
        key={index}
        query={question.query()}
        breakout={index != null ? query.breakouts()[index] : null}
        onChangeBreakout={breakout => {
          if (index != null) {
            query.updateBreakout(index, breakout).update(null, { run: true });
          } else {
            query.addBreakout(breakout).update(null, { run: true });
          }
          onClose();
        }}
        onClose={onClose}
      />
    </SidebarContent>
  );
};

export default BreakoutSidebar;
