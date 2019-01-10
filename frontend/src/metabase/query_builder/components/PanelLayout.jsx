import React from "react";
import { ResizableBox } from "react-resizable";
import { Box, Flex } from "grid-styled";
import { Motion, spring } from "react-motion";

const CollapseTrigger = props => (
  <Box
    {...props}
    className="absolute bg-medium bg-brand-hover cursor-pointer"
    style={{
      width: 6,
      height: 40,
      top: 0,
      bottom: 0,
      right: -10,
      content: "",
      borderRadius: 99,
      zIndex: 4,
    }}
  />
);

class PanelLayout extends React.Component {
  state = {
    panelOpen: true,
    panelWidth: window.innerWidth / 3,
  };
  render() {
    const { panel, children } = this.props;
    const { panelOpen, panelWidth } = this.state;
    return (
      <Flex flex={1} className="relative">
        {panel && (
          <Motion
            defaultStyle={{ width: 10 }}
            style={{ width: panelOpen ? panelWidth : spring(20) }}
          >
            {({ width }) => (
              <ResizableBox
                axis="x"
                minConstraints={[300]}
                maxConstraints={[window.innerWidth / 2]}
                width={width}
                height="100%"
                onResizeStop={(e, d) =>
                  this.setState({ panelWidth: d.size.width })
                }
              >
                {panel}
                <CollapseTrigger
                  onClick={() =>
                    this.setState({ panelOpen: !this.state.panelOpen })
                  }
                />
              </ResizableBox>
            )}
          </Motion>
        )}
        <Flex flex={1} bg="white" flexDirection="column">
          {children}
        </Flex>
      </Flex>
    );
  }
}

export default PanelLayout;
