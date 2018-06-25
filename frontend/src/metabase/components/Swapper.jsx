import React from "react";
import { Motion, spring } from "react-motion";

class Swapper extends React.Component {
  props: {
    defaultElement: React$Element,
    swappedElement: React$Element,
  };

  state = {
    hovered: false,
  };

  _onMouseEnter() {
    this.setState({ hovered: true });
  }

  _onMouseLeave() {
    this.setState({ hovered: false });
  }

  render() {
    const { defaultElement, swappedElement, startSwapped } = this.props;
    const { hovered } = this.state;

    return (
      <span
        onMouseEnter={() => this._onMouseEnter()}
        onMouseLeave={() => this._onMouseLeave()}
        className="block relative"
      >
        <Motion
          defaultStyle={{
            scale: 1,
          }}
          style={{
            scale: hovered || startSwapped ? spring(0) : spring(1),
          }}
        >
          {({ scale }) => {
            return (
              <span
                className=""
                style={{ display: "block", transform: `scale(${scale})` }}
              >
                {defaultElement}
              </span>
            );
          }}
        </Motion>
        <Motion
          defaultStyle={{
            scale: 0,
          }}
          style={{
            scale: hovered || startSwapped ? spring(1) : spring(0),
          }}
        >
          {({ scale }) => {
            return (
              <span
                className="absolute top left bottom right"
                style={{ display: "block", transform: `scale(${scale})` }}
              >
                {swappedElement}
              </span>
            );
          }}
        </Motion>
      </span>
    );
  }
}

export default Swapper;
