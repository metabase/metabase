import cx from "classnames";
import PropTypes from "prop-types";
import { Children, cloneElement, Component } from "react";
import ReactDOM from "react-dom";
import Tether from "tether";

import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";
import CS from "metabase/css/core/index.css";
import { isCypressActive } from "metabase/env";

import PopoverS from "./Popover.module.css";

// space we should leave between page edge and popover edge
const PAGE_PADDING = 10;
// Popover padding and border
const POPOVER_BODY_PADDING = 2;

/**
 * @deprecated prefer Popover from "metabase/ui" instead
 */
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
    // don't wrap the popover in an OnClickOutsideWrapper
    noOnClickOutsideWrapper: PropTypes.bool,
    targetOffsetX: PropTypes.number,
    targetOffsetY: PropTypes.number,
    onClose: PropTypes.func,
    containerClassName: PropTypes.string,
    className: PropTypes.string,
    style: PropTypes.object,
    children: PropTypes.oneOfType([
      PropTypes.element,
      PropTypes.func,
      PropTypes.array,
    ]),
    target: PropTypes.any,
    targetEvent: PropTypes.object,
    role: PropTypes.string,
    ignoreTrigger: PropTypes.bool,
  };

  static defaultProps = {
    isOpen: true,
    hasArrow: false,
    hasBackground: true,
    verticalAttachments: ["top", "bottom"],
    horizontalAttachments: ["left", "right"],
    alignVerticalEdge: false,
    alignHorizontalEdge: true,
    targetOffsetX: 0,
    targetOffsetY: 5,
    sizeToFit: false,
    autoWidth: false,
    noOnClickOutsideWrapper: false,
    containerClassName: "",
    ignoreTrigger: false,
  };

  _getPopoverElement(isOpen) {
    // 3s is an overkill for Cypress, but let's start with it and dial it down
    // if we see that the flakes don't appear anymore
    const resizeTimer = isCypressActive ? 3000 : 100;

    if (!this._popoverElement && isOpen) {
      this._popoverElement = document.createElement("span");
      this._popoverElement.className = cx(
        PopoverS.PopoverContainer,
        this.props.containerClassName,
      );
      this._popoverElement.dataset.testid = "popover";
      document.body.appendChild(this._popoverElement);

      this._timer = setInterval(() => {
        const { width, height } = this._popoverElement.getBoundingClientRect();
        if (this.state.width !== width || this.state.height !== height) {
          this.setState({ width, height });
        }
      }, resizeTimer);
    }
    return this._popoverElement;
  }

  componentDidMount() {
    this.updateComponentPosition(this.props.isOpen);
  }

  updateComponentPosition(isOpen) {
    if (!isOpen) {
      return;
    }

    const tetherOptions = {
      element: this._popoverElement,
      target: this._getTargetElement(),
    };

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
          targetAttachmentY: (
            this.props.alignVerticalEdge
              ? attachmentY === "bottom"
              : attachmentY === "top"
          )
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

    if (this.props.sizeToFit) {
      if (this._best.targetAttachmentY === "top") {
        this.constrainPopoverToBetweenViewportAndTarget(tetherOptions, "top");
      } else if (this._best.targetAttachmentY === "bottom") {
        this.constrainPopoverToBetweenViewportAndTarget(
          tetherOptions,
          "bottom",
        );
      }
    }

    // finally set the best options
    this._setTetherOptions(tetherOptions, this._best);
  }

  componentDidUpdate() {
    this.updateComponentPosition(this.props.isOpen);
  }

  componentWillUnmount() {
    if (this._tether) {
      this._tether.destroy();
      delete this._tether;
    }

    if (this._popoverElement) {
      if (this._popoverElement.parentNode) {
        this._popoverElement.parentNode.removeChild(this._popoverElement);
      }

      delete this._popoverElement;
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
    const content = (
      <div
        id={this.props.id}
        data-element-id="legacy-popover"
        className={cx(
          PopoverS.PopoverBody,
          {
            [PopoverS.PopoverBodyWithBackground]: this.props.hasBackground,
            [PopoverS.PopoverBodyWithArrow]:
              this.props.hasArrow && this.props.hasBackground,
            [PopoverS.PopoverBodyAutoWidth]: this.props.autoWidth,
          },
          // TODO kdoh 10/16/2017 we should eventually remove this
          this.props.className,
        )}
        role={this.props.role}
        style={this.props.style}
      >
        {typeof this.props.children === "function"
          ? this.props.children(childProps)
          : Children.count(this.props.children) === 1 &&
            // NOTE: workaround for https://github.com/facebook/react/issues/12136
            !Array.isArray(this.props.children)
          ? cloneElement(Children.only(this.props.children), childProps)
          : this.props.children}
      </div>
    );
    if (this.props.noOnClickOutsideWrapper) {
      return content;
    } else {
      return (
        <OnClickOutsideWrapper
          handleDismissal={this.handleDismissal}
          ignoreElement={
            this.props.ignoreTrigger ? this._getTargetElement() : undefined
          }
        >
          {content}
        </OnClickOutsideWrapper>
      );
    }
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
    const { top, bottom } = this._getTargetElement().getBoundingClientRect();

    let attachments;
    if (this.props.pinInitialAttachment && this._best) {
      // if we have a pinned attachment only use that
      attachments = [this._best.attachmentY];
    } else {
      // otherwise use the verticalAttachments prop
      attachments = this.props.verticalAttachments;
    }

    const availableHeights = attachments.map(attachmentY =>
      attachmentY === "top"
        ? window.innerHeight - bottom - this.props.targetOffsetY - PAGE_PADDING
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
    for (const attachment of attachments) {
      // compute the options for this attachment position then set it
      const options = getAttachmentOptions(best, attachment);
      this._setTetherOptions(tetherOptions, options);

      // get bounds within *document*
      const elementRect = Tether.Utils.getBounds(tetherOptions.element);

      // get bounds within *window*
      const doc = document.documentElement;
      const left =
        (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0);
      const top = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
      elementRect.top -= top;
      elementRect.bottom += top;
      elementRect.left -= left;
      elementRect.right += left;

      // test to see how much of the popover is off-screen
      const offScreen = offscreenProps
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

  _getTargetElement() {
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
        target = this.props.target();
      } else {
        target = this.props.target;
      }
    }

    if (target == null) {
      target = this._popoverElement;
    }

    return target;
  }

  constrainPopoverToBetweenViewportAndTarget(tetherOptions, direction) {
    const body = tetherOptions.element.querySelector(
      "[data-element-id=legacy-popover]",
    );
    const target = this._getTargetElement();
    const bodyHeight = body.getBoundingClientRect().height;
    const space =
      direction === "top"
        ? target.getBoundingClientRect().top
        : window.innerHeight - target.getBoundingClientRect().bottom;
    const maxHeight = space - PAGE_PADDING;
    if (bodyHeight > maxHeight) {
      body.style.maxHeight = maxHeight + "px";
      body.classList.add(CS.scrollY);
      body.classList.add(CS.scrollShow);
    }
  }

  render() {
    const isOpen = this.props.isOpen;

    const popoverElement = this._getPopoverElement(isOpen);
    if (popoverElement) {
      if (isOpen) {
        popoverElement.classList.add("PopoverContainer--open");
        popoverElement.classList.add("popover");
        popoverElement.dataset.state = "visible";
      } else {
        popoverElement.classList.remove("PopoverContainer--open");
        popoverElement.classList.remove("popover");
        popoverElement.dataset.state = "hidden";
      }
    }

    if (isOpen) {
      return ReactDOM.createPortal(
        <span>{isOpen ? this._popoverComponent() : null}</span>,
        popoverElement,
      );
    }

    return <span className={CS.hide} />;
  }
}
