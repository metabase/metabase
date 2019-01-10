import React from "react";
import { Flex } from "grid-styled";

import ResizablePane from "metabase/components/ResizablePane";

class PanelLayout extends React.Component {
  render() {
    const { panel, children } = this.props;
    return (
      <Flex flex={1} className="relative">
        {panel && <ResizablePane>{panel}</ResizablePane>}
        <Flex flex={1} bg="white" flexDirection="column">
          {children}
        </Flex>
      </Flex>
    );
  }
}

export default PanelLayout;
