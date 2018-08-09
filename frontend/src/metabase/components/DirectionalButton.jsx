import React from "react";
import Icon from "metabase/components/Icon";

import colors from "metabase/lib/colors";

const DirectionalButton = ({ direction = "back", onClick }) => (
  <div
    className="shadowed cursor-pointer text-brand-hover text-medium flex align-center circle p2 bg-white transition-background transition-color"
    onClick={onClick}
    style={{
      border: `1px solid ${colors["border"]}`,
      boxShadow: `0 2px 4px 0 ${colors["shadow"]}`,
    }}
  >
    <Icon name={`${direction}Arrow`} />
  </div>
);

export default DirectionalButton;
