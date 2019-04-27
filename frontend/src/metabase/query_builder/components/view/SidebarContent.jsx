import React from "react";

import Icon from "metabase/components/Icon";

const SidebarContent = ({ onClose, children }) => {
  return (
    <div className="relative">
      {onClose && (
        <Icon
          name="close"
          className="absolute top right p2"
          onClick={onClose}
        />
      )}
      {children}
    </div>
  );
};

export default SidebarContent;
