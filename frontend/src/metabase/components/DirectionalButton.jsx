/* eslint-disable react/prop-types */
import React from "react";

import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

const DirectionalButton = ({ direction = "left", onClick }) => (
  <div
    className="shadowed cursor-pointer text-brand-hover text-medium flex align-center circle p2 bg-white transition-background transition-color"
    onClick={onClick}
    style={{
      border: `1px solid ${color("border")}`,
      boxShadow: `0 2px 4px 0 ${color("shadow")}`,
    }}
  >
    <Icon name={`arrow_${direction}`} />
  </div>
);

export default DirectionalButton;
