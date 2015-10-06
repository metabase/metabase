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

    _setTetherOptions(tetherOptions) {
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
                for (let attachmentX of ["center", "left", "right"]) {
                    let [offsetY, offsetX] = [5, 0];
                    if (attachmentX === "left") {
                        offsetX = -(offsetX + 24);
                    } else if (attachmentX === "right") {
                        offsetX = offsetX + 24;
                    }
                    this._setTetherOptions({
                        ...tetherOptions,
                        attachment: "top " + attachmentX,
                        targetAttachment: "bottom center",
                        targetOffset: [offsetY, offsetX].map(o => o + "px").join(" "),
                        constraints: [{ to: 'window', attachment: 'together', pin: ['top', 'bottom']}]
                    });
                    let elementRect = Tether.Utils.getBounds(tetherOptions.element);
                    let obscured = Math.min(elementRect.left, 0) + Math.min(elementRect.right, 0);
                    if (obscured === 0) {
                        break;
                    }
                }
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
