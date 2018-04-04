import React from "react";
import Icon from "metabase/components/Icon";

const DirectionalButton = ({ direction = "back", onClick }) => (
  <div
    className="shadowed cursor-pointer text-brand-hover text-grey-4 flex align-center circle p2 bg-white transition-background transition-color"
    onClick={onClick}
    style={{
      border: "1px solid #DCE1E4",
      boxShadow: "0 2px 4px 0 #DCE1E4",
    }}
  >
    <Icon name={`${direction}Arrow`} />
  </div>
);

export default DirectionalButton;
