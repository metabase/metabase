import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import OnClickOutsideWrapper from "./OnClickOutsideWrapper.jsx";
import Tether from "tether";

import cx from "classnames";

export default class Popover extends Component {
    constructor(props, context) {
        super(props, context);

        this.handleClickOutside = this.handleClickOutside.bind(this);
    }

    static propTypes = {
        isOpen: PropTypes.bool,
        hasArrow: PropTypes.bool,
        getTarget: PropTypes.func,
        tetherOptions: PropTypes.object
    };

    static defaultProps = {
        isOpen: true,
        hasArrow: true,
        verticalAttachments: ["top", "bottom"],
        horizontalAttachments: ["center", "left", "right"],
        targetOffsetX: 24,
        targetOffsetY: 5
    };

    componentWillMount() {
        this._popoverElement = document.createElement('span');
        this._popoverElement.className = 'PopoverContainer';
        this._popoverElement.id = Math.floor((Math.random() * 698754) + 1);
        document.querySelector('body').appendChild(this._popoverElement);
    }

    componentDidMount() {
        this._renderPopover();
    }

    componentDidUpdate() {
        this._renderPopover();
    }

    componentWillUnmount() {
        if (this._tether) {
            this._tether.destroy();
            delete this._tether;
        }
        ReactDOM.unmountComponentAtNode(this._popoverElement);
        if (this._popoverElement.parentNode) {
            this._popoverElement.parentNode.removeChild(this._popoverElement);
        }
    }

    handleClickOutside(...args) {
        if (this.props.onClose) {
            this.props.onClose(...args)
        }
    }

    _popoverComponent() {
        return (
            <OnClickOutsideWrapper handleClickOutside={this.handleClickOutside}>
                <div className={cx("PopoverBody", { "PopoverBody--withArrow": this.props.hasArrow }, this.props.className)}>
                    {this.props.children}
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

    _renderPopover() {
        if (this.props.isOpen) {
            // popover is open, lets do this!
            ReactDOM.render(this._popoverComponent(), this._popoverElement);

            var tetherOptions = {};

            tetherOptions.element = this._popoverElement;

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
                tetherOptions.target = ReactDOM.findDOMNode(this.props.target);
            } else if (this.props.getTarget) {
                tetherOptions.target = ReactDOM.findDOMNode(this.props.getTarget());
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

                // finally set the best options
                this._setTetherOptions(tetherOptions, best);
            }
        } else {
            // if the popover isn't open then actively unmount our popover
            ReactDOM.unmountComponentAtNode(this._popoverElement);
        }
    }

    render() {
        return <span className="hide" />;
    }
}
