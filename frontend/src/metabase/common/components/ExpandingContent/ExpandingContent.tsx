import cx from "classnames";
import type { ReactNode } from "react";
import { Component, createRef } from "react";

import CS from "metabase/css/core/index.css";
import { isReducedMotionPreferred } from "metabase/utils/dom";

interface ExpandingContentProps {
  isOpen: boolean;
  isInitiallyOpen?: boolean;
  duration?: number;
  animateHeight?: boolean;
  animateOpacity?: boolean;
  children?: ReactNode;
}

interface ExpandingContentState {
  isOpen: boolean;
  isTransitioning: boolean;
}

export class ExpandingContent extends Component<
  ExpandingContentProps,
  ExpandingContentState
> {
  static defaultProps = {
    duration: 300,
    animateHeight: true,
    animateOpacity: true,
  };

  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _ref = createRef<HTMLDivElement>();

  constructor(props: ExpandingContentProps) {
    super(props);
    this.state = {
      isOpen: props.isInitiallyOpen == null ? true : !!props.isInitiallyOpen,
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

  setOpen(isOpen: boolean) {
    const open = isOpen;
    if (this.state.isOpen !== open) {
      this.clearTimer();
      this.setState({ isOpen: open, isTransitioning: true }, () => {
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
    const transition = isReducedMotionPreferred()
      ? `none`
      : `all ${duration}ms ease`;
    const { isOpen, isTransitioning } = this.state;
    const maxHeight = isTransitioning
      ? (this._ref.current && this._ref.current.scrollHeight) || 0
      : "none";
    return (
      <div
        ref={this._ref}
        style={{
          transition,
          maxHeight: !animateHeight || isOpen ? maxHeight : 0,
          opacity: !animateOpacity || isOpen ? 1 : 0,
        }}
        className={cx({ [CS.overflowHidden]: !isOpen })}
      >
        {children}
      </div>
    );
  }
}
