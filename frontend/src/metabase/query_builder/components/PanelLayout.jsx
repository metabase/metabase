import React from "react";

const PanelLayout = ({ panel, children }) => (
  <div className="relative flex flex-row flex-full">
    {panel && (
      <div className="border-right" style={{ minWidth: 300 }}>
        {panel}
      </div>
    )}
    <div className="pl4 flex-full bg-white flex flex-column">{children}</div>
  </div>
);

export default PanelLayout;
