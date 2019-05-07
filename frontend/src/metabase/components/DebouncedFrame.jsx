import React from "react";

import cx from "classnames";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";

const DEBOUNCE_PERIOD = 100;
const DEFAULT_TRANSITION_STYLE = {
  opacity: 0.5,
};

@ExplicitSize()
export default class DebouncedFrame extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      width: props.width,
      height: props.height,
      transition: false,
    };
  }

  static defaultProps = {
    transitionStyle: DEFAULT_TRANSITION_STYLE,
  };

  setSize = (width, height) => {
    this.setState({ width, height, transition: false });
  };

  setSizeDebounced = _.debounce(this.setSize, DEBOUNCE_PERIOD);

  componentWillReceiveProps(nextProps) {
    if (
      this.props.width !== nextProps.width ||
      this.props.height !== nextProps.height
    ) {
      if (this.state.width == null || this.state.height == null) {
        this.setSize(nextProps.width, nextProps.height);
      } else {
        this.setState({ transition: true });
        this.setSizeDebounced(nextProps.width, nextProps.height);
      }
    }
  }

  render() {
    const { children, className, style = {}, transitionStyle } = this.props;
    const { width, height, transition } = this.state;
    return (
      <div
        className={cx(className, "relative")}
        style={{
          overflow: "hidden",
          transition: "opacity 0.25s",
          ...(transition ? transitionStyle : {}),
          ...style,
        }}
      >
        <div className="absolute" style={{ width, height }}>
          {children}
        </div>
      </div>
    );
  }
}
