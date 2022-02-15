/* eslint-disable react/prop-types */
import React from "react";
import { Motion, spring } from "react-motion";

import { isReducedMotionPreferred } from "metabase/lib/dom";

class Swapper extends React.Component {
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

    const preferReducedMotion = isReducedMotionPreferred();
    const springOpts = preferReducedMotion
      ? { stiffness: 500 }
      : { stiffness: 170 };

    return (
      <span
        onMouseEnter={() => this._onMouseEnter()}
        onMouseLeave={() => this._onMouseLeave()}
        className="block relative"
        style={{ lineHeight: 1 }}
      >
        <Motion
          defaultStyle={{
            scale: 1,
          }}
          style={{
            scale:
              hovered || startSwapped
                ? spring(0, springOpts)
                : spring(1, springOpts),
          }}
        >
          {({ scale }) => {
            const snapScale = scale < 0.5 ? 0 : 1;
            const _scale = preferReducedMotion ? snapScale : scale;
            return (
              <span
                style={{
                  display: "block",
                  transform: `scale(${_scale})`,
                }}
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
            scale:
              hovered || startSwapped
                ? spring(1, springOpts)
                : spring(0, springOpts),
          }}
        >
          {({ scale }) => {
            const snapScale = scale < 0.5 ? 0 : 1;
            const _scale = preferReducedMotion ? snapScale : scale;
            return (
              <span
                className="absolute top left bottom right"
                style={{ display: "block", transform: `scale(${_scale})` }}
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
