import React, { Component, PropTypes } from "react";

import OnClickOutsideWrapper from "./OnClickOutsideWrapper.react";
import Tether from "tether";

import cx from "classnames";

export default class Popover extends Component {
    constructor(props) {
        super(props);

        this.handleClickOutside = this.handleClickOutside.bind(this);
    }

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
        React.unmountComponentAtNode(this._popoverElement);
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
        console.log(tetherOptions)
        if (this._tether) {
            this._tether.setOptions(tetherOptions);
        } else {
            this._tether = new Tether(tetherOptions);
        }
    }

    _renderPopover() {
        if (this.props.isOpen) {
            // popover is open, lets do this!
            React.render(
                <div className="Popover-backdrop">
                    {this._popoverComponent()}
                </div>
            , this._popoverElement);

            var tetherOptions = {};

            tetherOptions.element = this._popoverElement;

            if (!tetherOptions.target && this.props.getTriggerTarget) {
                tetherOptions.target = React.findDOMNode(this.props.getTriggerTarget());
            }
            if (!tetherOptions.target) {
                tetherOptions.target = React.findDOMNode(this).parentNode;
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
                    offsetY: 5
                };
                let bestOffScreen;

                // try horizontal positions
                bestOffScreen = -Infinity;
                for (let attachmentX of ["center", "left", "right"]) {
                    // compute the options for this attachment position then set it
                    let options = {
                        ...best,
                        attachmentX: attachmentX,
                        targetAttachmentX: "center",
                        offsetX: ({ "center": 0, "left": -24, "right": 24 })[attachmentX]
                    }
                    this._setTetherOptions(tetherOptions, options);
                    // test to see how much of the popover is off-screen
                    let elementRect = Tether.Utils.getBounds(tetherOptions.element);
                    let offScreen = Math.min(elementRect.left, 0) + Math.min(elementRect.right, 0);
                    // if none then we're done, otherwise check to see if it's the best option so far
                    if (offScreen === 0) {
                        best = options;
                        break;
                    } else if (offScreen > bestOffScreen) {
                        best = options;
                        bestOffScreen = offScreen;
                    }
                }

                // try vertical positions
                bestOffScreen = -Infinity;
                for (let attachmentY of ["top", "bottom"]) {
                    // compute the options for this attachment position then set it
                    let options = {
                        ...best,
                        attachmentY: attachmentY,
                        targetAttachmentY: (attachmentY === "top" ? "bottom" : "top"),
                        offsetY: ({ "top": 5, "bottom": -5 })[attachmentY]
                    }
                    this._setTetherOptions(tetherOptions, options);
                    // test to see how much of the popover is off-screen
                    let elementRect = Tether.Utils.getBounds(tetherOptions.element);
                    let offScreen = Math.min(elementRect.top, 0) + Math.min(elementRect.bottom, 0);
                    // if none then we're done, otherwise check to see if it's the best option so far
                    if (offScreen === 0) {
                        best = options;
                        break;
                    } else if (offScreen > bestOffScreen) {
                        best = options;
                        bestOffScreen = offScreen;
                    }
                }

                // finally set the best options
                this._setTetherOptions(tetherOptions, best);
            }
        } else {
            // if the popover isn't open then actively unmount our popover
            React.unmountComponentAtNode(this._popoverElement);
        }
    }

    render() {
        return <span className="hide" />;
    }
}

Popover.propTypes = {
    isOpen: PropTypes.bool,
    hasArrow: PropTypes.bool,
    getTriggerTarget: PropTypes.func,
    tetherOptions: PropTypes.object
};

Popover.defaultProps = {
    isOpen: true,
    hasArrow: true
};
