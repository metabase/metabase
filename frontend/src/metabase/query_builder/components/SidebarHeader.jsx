import React from "react";

import Icon from "metabase/components/Icon";

const SidebarHeader = ({ title, onClose }) => (
  <div className="DataReference-header flex align-center mb2">
    <h2 className="text-default">{title}</h2>
    <a
      className="flex-align-right text-default text-brand-hover no-decoration"
      onClick={onClose}
    >
      <Icon name="close" size={18} />
    </a>
  </div>
);

export default SidebarHeader;
