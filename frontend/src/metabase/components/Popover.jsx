import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import ReactCSSTransitionGroup from "react-addons-css-transition-group";

import OnClickOutsideWrapper from "./OnClickOutsideWrapper";
import Tether from "tether";

import { constrainToScreen } from "metabase/lib/dom";

import cx from "classnames";

import "./Popover.css";

const POPOVER_TRANSITION_ENTER = 100;
const POPOVER_TRANSITION_LEAVE = 100;

export default class Popover extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            width: null,
            height: null
        };

        this.handleDismissal = this.handleDismissal.bind(this);
    }

    static propTypes = {
        id: PropTypes.string,
        isOpen: PropTypes.bool,
        hasArrow: PropTypes.bool,
        // target: PropTypes.oneOfType([PropTypes.func, PropTypes.node]),
        tetherOptions: PropTypes.object,
        // used to prevent popovers from being taller than the screen
        sizeToFit: PropTypes.bool,
        pinInitialAttachment: PropTypes.bool,
        // most popovers have a max-width to prevent them from being overly wide
        // in the case their content is of an unexpected length
        // noMaxWidth allows that to be overridden in cases where popovers should
        // expand  alongside their contents contents
        autoWidth: PropTypes.bool
    };

    static defaultProps = {
        isOpen: true,
        hasArrow: true,
        verticalAttachments: ["top", "bottom"],
        horizontalAttachments: ["center", "left", "right"],
        targetOffsetX: 24,
        targetOffsetY: 5,
        sizeToFit: false,
        autoWidth: false
    };

    _getPopoverElement() {
        if (!this._popoverElement) {
            this._popoverElement = document.createElement('span');
            this._popoverElement.className = 'PopoverContainer';
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
                clearInterval(this._timer);
                delete this._popoverElement, this._timer;
            }, POPOVER_TRANSITION_LEAVE);
        }
    }

    handleDismissal(...args) {
        if (this.props.onClose) {
            this.props.onClose(...args)
        }
    }

    _popoverComponent() {
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
                            "PopoverBody--withArrow": this.props.hasArrow,
                            "PopoverBody--autoWidth": this.props.autoWidth
                        },
                        // TODO kdoh 10/16/2017 we should eventually remove this
                        this.props.className
                    )}
                    style={this.props.style}
                >
                    { typeof this.props.children === "function" ?
                        this.props.children()
                        :
                        this.props.children
                    }
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
                targetOffset: `${o.offsetY}px ${o.offsetX}px`
            }
        }
        if (this._tether) {
            this._tether.setOptions(tetherOptions);
        } else {
            this._tether = new Tether(tetherOptions);
        }
    }

    _getBestAttachmentOptions(tetherOptions, options, attachments, offscreenProps, getAttachmentOptions) {
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
            let top = (window.pageYOffset || doc.scrollTop)  - (doc.clientTop || 0);
            elementRect.top -= top;
            elementRect.bottom += top;
            elementRect.left -= left;
            elementRect.right += left;

            // test to see how much of the popover is off-screen
            let offScreen = offscreenProps.map(prop => Math.min(elementRect[prop], 0)).reduce((a, b) => a + b);
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

    _renderPopover(isOpen) {
        // popover is open, lets do this!
        const popoverElement = this._getPopoverElement();
        ReactDOM.unstable_renderSubtreeIntoContainer(this,
            <ReactCSSTransitionGroup
                transitionName="Popover"
                transitionAppear
                transitionEnter
                transitionLeave
                transitionAppearTimeout={POPOVER_TRANSITION_ENTER}
                transitionEnterTimeout={POPOVER_TRANSITION_ENTER}
                transitionLeaveTimeout={POPOVER_TRANSITION_LEAVE}
            >
                { isOpen ? this._popoverComponent() : null }
            </ReactCSSTransitionGroup>
        , popoverElement);

        if (isOpen) {
            var tetherOptions = {};

            tetherOptions.element = popoverElement;

            if (this.props.targetEvent) {
                // create a fake element at the event coordinates
                tetherOptions.target = document.getElementById("popover-event-target");
                if (!tetherOptions.target) {
                    tetherOptions.target = document.createElement("div");
                    tetherOptions.target.id = "popover-event-target";
                    document.body.appendChild(tetherOptions.target);

                }
                tetherOptions.target.style.left = (this.props.targetEvent.clientX - 3) + "px";
                tetherOptions.target.style.top = (this.props.targetEvent.clientY - 3) + "px";
            } else if (this.props.target) {
                if (typeof this.props.target === "function") {
                    tetherOptions.target = ReactDOM.findDOMNode(this.props.target());
                } else {
                    tetherOptions.target = ReactDOM.findDOMNode(this.props.target);
                }
            }
            if (tetherOptions.target == null) {
                tetherOptions.target = ReactDOM.findDOMNode(this).parentNode;
            }

            if (this.props.tetherOptions) {
                this._setTetherOptions({
                    ...tetherOptions,
                    ...this.props.tetherOptions
                });
            } else {
                if (!this._best || !this.props.pinInitialAttachment) {
                    let best = {
                        attachmentX: "center",
                        attachmentY: "top",
                        targetAttachmentX: "center",
                        targetAttachmentY: "bottom",
                        offsetX: 0,
                        offsetY: 0
                    };

                    // horizontal
                    best = this._getBestAttachmentOptions(
                        tetherOptions, best, this.props.horizontalAttachments, ["left", "right"],
                        (best, attachmentX) => ({
                            ...best,
                            attachmentX: attachmentX,
                            targetAttachmentX: "center",
                            offsetX: ({ "center": 0, "left": -(this.props.targetOffsetX), "right": this.props.targetOffsetX })[attachmentX]
                        })
                    );

                    // vertical
                    best = this._getBestAttachmentOptions(
                        tetherOptions, best, this.props.verticalAttachments, ["top", "bottom"],
                        (best, attachmentY) => ({
                            ...best,
                            attachmentY: attachmentY,
                            targetAttachmentY: (attachmentY === "top" ? "bottom" : "top"),
                            offsetY: ({ "top": this.props.targetOffsetY, "bottom": -(this.props.targetOffsetY) })[attachmentY]
                        })
                    );

                    this._best = best;
                }

                // finally set the best options
                this._setTetherOptions(tetherOptions, this._best);
            }

            if (this.props.sizeToFit) {
                const verticalPadding = 5;
                const body = tetherOptions.element.querySelector(".PopoverBody");
                if (this._tether.attachment.top === "top") {
                    if (constrainToScreen(body, "bottom", verticalPadding)) {
                        body.classList.add("scroll-y");
                        body.classList.add("scroll-show");
                    }
                } else if (this._tether.attachment.top === "bottom") {
                    if (constrainToScreen(body, "top", verticalPadding)) {
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

/**
 * A modified version of TestPopover for Jest/Enzyme tests.
 * Simply renders the popover body inline instead of mutating DOM root.
 */
export const TestPopover = (props) =>
    (props.isOpen === undefined || props.isOpen) ?
        <OnClickOutsideWrapper
            handleDismissal={(...args) => { props.onClose && props.onClose(...args) }}
            dismissOnEscape={props.dismissOnEscape}
            dismissOnClickOutside={props.dismissOnClickOutside}
        >
            <div
                id={props.id}
                className={cx("TestPopover TestPopoverBody", props.className)}
                style={props.style}
                // because popover is normally directly attached to body element, other elements should not need
                // to care about clicks that happen inside the popover
                onClick={ (e) => { e.stopPropagation(); } }
            >
                { typeof props.children === "function" ? props.children() : props.children}
            </div>
        </OnClickOutsideWrapper>
        : null
