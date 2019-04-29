import React from "react";

import Icon from "metabase/components/Icon";

const SidebarContent = ({ icon, title, onClose, children }) => {
  return (
    <div>
      <div className="flex mb1 pl4 pr2 pt3">
        <div className="flex align-center pb1">
          {icon && <Icon name={icon} />}
          {title && <h3 className="ml1 text-heavy">{title}</h3>}
        </div>
        {onClose && (
          <Icon
            name="close"
            className="flex-align-right text-medium text-brand-hover cursor-pointer"
            onClick={onClose}
            size={20}
          />
        )}
      </div>
      {children}
    </div>
  );
};

export default SidebarContent;
