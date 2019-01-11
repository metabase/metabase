import React from "react";
import { ResizableBox } from "react-resizable";
import { Box } from "grid-styled";
import { Motion, spring } from "react-motion";

const CollapseTrigger = props => (
  <Box
    {...props}
    className="absolute bg-medium bg-brand-hover cursor-pointer"
    style={{
      marginTop: "auto",
      marginBottom: "auto",
      width: 6,
      height: 40,
      top: 0,
      bottom: 0,
      right: -10,
      content: "",
      borderRadius: 99,
      zIndex: 2,
    }}
  />
);

export default class ResizablePane extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      width: props.initialWidth,
      panelOpen: true,
      panelWidth: window.innerWidth / 3,
    };
  }

  render() {
    const { children } = this.props;
    const { panelOpen, panelWidth } = this.state;
    return (
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
            onResizeStop={(e, d) => this.setState({ panelWidth: d.size.width })}
          >
            <span className="overflow-hidden scroll-y absolute top left bottom right">
              {children}
            </span>
            <CollapseTrigger
              onClick={() =>
                this.setState({ panelOpen: !this.state.panelOpen })
              }
            />
          </ResizableBox>
        )}
      </Motion>
    );
  }
}
