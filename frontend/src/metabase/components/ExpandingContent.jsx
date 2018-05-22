import React, { Component } from "react";

class ExpandingContent extends Component {
  constructor() {
    super();
    this.state = { open: false };
  }
  render() {
    const { children, open } = this.props;
    return (
      <div
        style={{
          maxHeight: open ? "none" : 0,
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
      >
        {children}
      </div>
    );
  }
}

export default ExpandingContent;
