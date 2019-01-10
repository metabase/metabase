import React from "react";

import ResizablePane from "metabase/components/ResizablePane";

const INITIAL_WIDTH_PERCENT = 0.3;
const INITIAL_WIDTH_MIN = 300;
const INITIAL_WIDTH_MAX = 300;

const PanelLayout = ({ panel, children }) => (
  <div className="relative flex flex-row flex-full">
    {panel && (
      <ResizablePane
        className="border-right"
        initialWidth={Math.max(
          INITIAL_WIDTH_MIN,
          Math.min(
            INITIAL_WIDTH_MAX,
            window.innerWidth * INITIAL_WIDTH_PERCENT,
          ),
        )}
      >
        {panel}
      </ResizablePane>
    )}
    <div className="pl4 flex-full bg-white flex flex-column">{children}</div>
  </div>
);

export default PanelLayout;
