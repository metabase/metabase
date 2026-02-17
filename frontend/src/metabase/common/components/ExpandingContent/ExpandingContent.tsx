import cx from "classnames";
import { Component, type ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { isReducedMotionPreferred } from "metabase/lib/dom";

interface ExpandingContentProps {
  isOpen: boolean;
  isInitiallyOpen: boolean;
  children: ReactNode;
}

interface ExpandingContentState {
  isOpen: boolean;
  isTransitioning: boolean;
}

export class ExpandingContent extends Component<
  ExpandingContentProps,
  ExpandingContentState
> {
  _ref: HTMLDivElement | null = null;
  _timer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ExpandingContentProps) {
    super(props);
    this.state = {
      isOpen: props.isInitiallyOpen == null ? true : !!props.isInitiallyOpen,
      // keep track of whether we're currently transitioning so we can set maxHeight to "none" when not
      isTransitioning: false,
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps: ExpandingContentProps) {
    this.setOpen(nextProps.isOpen);
  }
  componentDidMount() {
    this.setOpen(this.props.isOpen);
  }
  componentWillUnmount() {
    this.clearTimer();
  }

  setOpen(isOpen: boolean | undefined) {
    const open = !!isOpen;
    if (this.state.isOpen !== open) {
      this.clearTimer();
      this.setState({ isOpen: open, isTransitioning: true }, () => {
        this._timer = setTimeout(() => {
          this.setState({ isTransitioning: false });
        }, 300);
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
    const { children } = this.props;
    const transition = isReducedMotionPreferred() ? "none" : "all 300ms ease";
    const { isOpen, isTransitioning } = this.state;
    // get the actual content height (after the first render)
    const maxHeight = isTransitioning
      ? (this._ref && this._ref.scrollHeight) || 0
      : "none";
    return (
      <div
        ref={(ref) => (this._ref = ref)}
        style={{
          transition,
          maxHeight: isOpen ? maxHeight : 0,
          opacity: isOpen ? 1 : 0,
        }}
        className={cx({ [CS.overflowHidden]: !isOpen })}
      >
        {children}
      </div>
    );
  }
}
