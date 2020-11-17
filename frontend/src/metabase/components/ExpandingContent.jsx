import React, { Component } from "react";

class ExpandingContent extends Component {
  constructor({ isInitiallyOpen }) {
    super();
    this.state = {
      isOpen: isInitiallyOpen == null ? true : !!isInitiallyOpen,
      // keep track of whether we're currently transitioning so we can set maxHeight to "none" when not
      isTransitioning: false,
    };
  }

  static defaultProps = {
    duration: 300,
    opacity: true,
    animateHeight: true,
    animateOpacity: true,
  };

  componentWillReceiveProps(nextProps) {
    this.setOpen(nextProps.isOpen);
  }
  componentDidMount() {
    this.setOpen(this.props.isOpen);
  }
  componentWillUnmount() {
    this.clearTimer();
  }

  setOpen(isOpen) {
    isOpen = !!isOpen;
    if (this.state.isOpen !== isOpen) {
      this.clearTimer();
      this.setState({ isOpen: isOpen, isTransitioning: true }, () => {
        this._timer = setTimeout(() => {
          this.setState({ isTransitioning: false });
        }, this.props.duration);
      });
    }
  }
  clearTimer() {
    if (this._timer != null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  render() {
    const { children, duration, animateHeight, animateOpacity } = this.props;
    const { isOpen, isTransitioning } = this.state;
    // get the actual content height (after the first render)
    const maxHeight = isTransitioning
      ? (this._ref && this._ref.scrollHeight) || 0
      : "none";
    return (
      <div
        ref={ref => (this._ref = ref)}
        style={{
          transition: `all ${duration}ms ease`,
          maxHeight: !animateHeight || isOpen ? maxHeight : 0,
          opacity: !animateOpacity || isOpen ? 1 : 0,
        }}
      >
        {children}
      </div>
    );
  }
}

export default ExpandingContent;
