import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { CSSTransitionGroup } from "react-transition-group";

import OnClickOutsideWrapper from "./OnClickOutsideWrapper";
import Tether from "tether";

import { constrainToScreen } from "metabase/lib/dom";

import cx from "classnames";

import "./Popover.css";

const POPOVER_TRANSITION_ENTER = 100;
const POPOVER_TRANSITION_LEAVE = 100;

// space we should leave berween page edge and popover edge
const PAGE_PADDING = 10;
// Popover padding and border
const POPOVER_BODY_PADDING = 2;

export default class Popover extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      width: null,
      height: null,
    };

    this.handleDismissal = this.handleDismissal.bind(this);
  }

  static propTypes = {
    id: PropTypes.string,
    isOpen: PropTypes.bool,
    hasArrow: PropTypes.bool,
    hasBackground: PropTypes.bool,
    // target: PropTypes.oneOfType([PropTypes.func, PropTypes.node]),
    tetherOptions: PropTypes.object,
    // used to prevent popovers from being taller than the screen
    sizeToFit: PropTypes.bool,
    pinInitialAttachment: PropTypes.bool,
    // most popovers have a max-width to prevent them from being overly wide
    // in the case their content is of an unexpected length
    // noMaxWidth allows that to be overridden in cases where popovers should
    // expand  alongside their contents contents
    autoWidth: PropTypes.bool,
    // prioritized vertical attachments points on the popover
    verticalAttachments: PropTypes.array,
    // prioritized horizontal attachment points on the popover
    horizontalAttachments: PropTypes.array,
    // by default we align the top edge of the target to the bottom edge of the
    // popover or vice versa. This causes the same edges to be aligned
    alignVerticalEdge: PropTypes.bool,
    // by default we align the popover to the center of the target. This
    // causes the edges to be aligned
    alignHorizontalEdge: PropTypes.bool,
  };

  static defaultProps = {
    isOpen: true,
    hasArrow: true,
    hasBackground: true,
    verticalAttachments: ["top", "bottom"],
    horizontalAttachments: ["center", "left", "right"],
    alignVerticalEdge: false,
    alignHorizontalEdge: false,
    targetOffsetX: 24,
    targetOffsetY: 5,
    sizeToFit: false,
    autoWidth: false,
  };

  _getPopoverElement() {
    if (!this._popoverElement) {
      this._popoverElement = document.createElement("span");
      this._popoverElement.className = "PopoverContainer";
      document.body.appendChild(this._popoverElement);
      this._timer = setInterval(() => {
        const { width, height } = this._popoverElement.getBoundingClientRect();
        if (this.state.width !== width || this.state.height !== height) {
          this.setState({ width, height });
        }
      }, 100);
    }
    return this._popoverElement;
  }

  componentDidMount() {
    this._renderPopover(this.props.isOpen);
  }

  componentDidUpdate() {
    this._renderPopover(this.props.isOpen);
  }

  componentWillUnmount() {
    if (this._tether) {
      this._tether.destroy();
      delete this._tether;
    }
    if (this._popoverElement) {
      this._renderPopover(false);
      setTimeout(() => {
        ReactDOM.unmountComponentAtNode(this._popoverElement);
        if (this._popoverElement.parentNode) {
          this._popoverElement.parentNode.removeChild(this._popoverElement);
        }
        delete this._popoverElement;
      }, POPOVER_TRANSITION_LEAVE);
      clearInterval(this._timer);
      delete this._timer;
    }
  }

  handleDismissal(...args) {
    if (this.props.onClose) {
      this.props.onClose(...args);
    }
  }

  _popoverComponent() {
    const childProps = {
      maxHeight: this._getMaxHeight(),
    };
    return (
      <OnClickOutsideWrapper
        handleDismissal={this.handleDismissal}
        dismissOnEscape={this.props.dismissOnEscape}
        dismissOnClickOutside={this.props.dismissOnClickOutside}
      >
        <div
          id={this.props.id}
          className={cx(
            "PopoverBody",
            {
              "PopoverBody--withBackground": this.props.hasBackground,
              "PopoverBody--withArrow":
                this.props.hasArrow && this.props.hasBackground,
              "PopoverBody--autoWidth": this.props.autoWidth,
            },
            // TODO kdoh 10/16/2017 we should eventually remove this
            this.props.className,
          )}
          style={this.props.style}
        >
          {typeof this.props.children === "function"
            ? this.props.children(childProps)
            : React.Children.count(this.props.children) === 1
              ? React.cloneElement(
                  React.Children.only(this.props.children),
                  childProps,
                )
              : this.props.children}
        </div>
      </OnClickOutsideWrapper>
    );
  }

  _setTetherOptions(tetherOptions, o) {
    if (o) {
      tetherOptions = {
        ...tetherOptions,
        attachment: `${o.attachmentY} ${o.attachmentX}`,
        targetAttachment: `${o.targetAttachmentY} ${o.targetAttachmentX}`,
        targetOffset: `${o.offsetY}px ${o.offsetX}px`,
      };
    }
    if (this._tether) {
      this._tether.setOptions(tetherOptions);
    } else {
      this._tether = new Tether(tetherOptions);
    }
  }

  _getMaxHeight() {
    const { top, bottom } = this._getTarget().getBoundingClientRect();

    let attachments;
    if (this.props.pinInitialAttachment && this._best) {
      // if we have a pinned attachment only use that
      attachments = [this._best.attachmentY];
    } else {
      // otherwise use the verticalAttachments prop
      attachments = this.props.verticalAttachments;
    }

    const availableHeights = attachments.map(
      attachmentY =>
        attachmentY === "top"
          ? window.innerHeight -
            bottom -
            this.props.targetOffsetY -
            PAGE_PADDING
          : attachmentY === "bottom"
            ? top - this.props.targetOffsetY - PAGE_PADDING
            : 0,
    );

    // get the largest available height, then subtract .PopoverBody's border and padding
    return Math.max(...availableHeights) - POPOVER_BODY_PADDING;
  }

  _getBestAttachmentOptions(
    tetherOptions,
    options,
    attachments,
    offscreenProps,
    getAttachmentOptions,
  ) {
    let best = { ...options };
    let bestOffScreen = -Infinity;
    // try each attachment until one is entirely on screen, or pick the least bad one
    for (let attachment of attachments) {
      // compute the options for this attachment position then set it
      let options = getAttachmentOptions(best, attachment);
      this._setTetherOptions(tetherOptions, options);

      // get bounds within *document*
      let elementRect = Tether.Utils.getBounds(tetherOptions.element);

      // get bounds within *window*
      let doc = document.documentElement;
      let left = (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0);
      let top = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
      elementRect.top -= top;
      elementRect.bottom += top;
      elementRect.left -= left;
      elementRect.right += left;

      // test to see how much of the popover is off-screen
      let offScreen = offscreenProps
        .map(prop => Math.min(elementRect[prop], 0))
        .reduce((a, b) => a + b);
      // if none then we're done, otherwise check to see if it's the best option so far
      if (offScreen === 0) {
        best = options;
        break;
      } else if (offScreen > bestOffScreen) {
        best = options;
        bestOffScreen = offScreen;
      }
    }
    return best;
  }

  _getTarget() {
    let target;
    if (this.props.targetEvent) {
      // create a fake element at the event coordinates
      target = document.getElementById("popover-event-target");
      if (!target) {
        target = document.createElement("div");
        target.id = "popover-event-target";
        document.body.appendChild(target);
      }
      target.style.left = this.props.targetEvent.clientX - 3 + "px";
      target.style.top = this.props.targetEvent.clientY - 3 + "px";
    } else if (this.props.target) {
      if (typeof this.props.target === "function") {
        target = ReactDOM.findDOMNode(this.props.target());
      } else {
        target = ReactDOM.findDOMNode(this.props.target);
      }
    }
    if (target == null) {
      target = ReactDOM.findDOMNode(this).parentNode;
    }
    return target;
  }

  _renderPopover(isOpen) {
    // popover is open, lets do this!
    const popoverElement = this._getPopoverElement();
    ReactDOM.unstable_renderSubtreeIntoContainer(
      this,
      <CSSTransitionGroup
        transitionName="Popover"
        transitionAppear
        transitionEnter
        transitionLeave
        transitionAppearTimeout={POPOVER_TRANSITION_ENTER}
        transitionEnterTimeout={POPOVER_TRANSITION_ENTER}
        transitionLeaveTimeout={POPOVER_TRANSITION_LEAVE}
      >
        {isOpen ? this._popoverComponent() : null}
      </CSSTransitionGroup>,
      popoverElement,
    );

    if (isOpen) {
      let tetherOptions = {
        element: popoverElement,
        target: this._getTarget(),
      };

      if (this.props.tetherOptions) {
        this._setTetherOptions({
          ...tetherOptions,
          ...this.props.tetherOptions,
        });
      } else {
        if (!this._best || !this.props.pinInitialAttachment) {
          let best = {
            attachmentX: "center",
            attachmentY: "top",
            targetAttachmentX: "center",
            targetAttachmentY: "bottom",
            offsetX: 0,
            offsetY: 0,
          };

          // horizontal
          best = this._getBestAttachmentOptions(
            tetherOptions,
            best,
            this.props.horizontalAttachments,
            ["left", "right"],
            (best, attachmentX) => ({
              ...best,
              attachmentX: attachmentX,
              targetAttachmentX: this.props.alignHorizontalEdge
                ? attachmentX
                : "center",
              offsetX: {
                center: 0,
                left: -this.props.targetOffsetX,
                right: this.props.targetOffsetX,
              }[attachmentX],
            }),
          );

          // vertical
          best = this._getBestAttachmentOptions(
            tetherOptions,
            best,
            this.props.verticalAttachments,
            ["top", "bottom"],
            (best, attachmentY) => ({
              ...best,
              attachmentY: attachmentY,
              targetAttachmentY: (this.props.alignVerticalEdge
              ? attachmentY === "bottom"
              : attachmentY === "top")
                ? "bottom"
                : "top",
              offsetY: {
                top: this.props.targetOffsetY,
                bottom: -this.props.targetOffsetY,
              }[attachmentY],
            }),
          );

          this._best = best;
        }

        // finally set the best options
        this._setTetherOptions(tetherOptions, this._best);
      }

      if (this.props.sizeToFit) {
        const body = tetherOptions.element.querySelector(".PopoverBody");
        if (this._tether.attachment.top === "top") {
          if (constrainToScreen(body, "bottom", PAGE_PADDING)) {
            body.classList.add("scroll-y");
            body.classList.add("scroll-show");
          }
        } else if (this._tether.attachment.top === "bottom") {
          if (constrainToScreen(body, "top", PAGE_PADDING)) {
            body.classList.add("scroll-y");
            body.classList.add("scroll-show");
          }
        }
      }
    }
  }

  render() {
    return <span className="hide" />;
  }
}
