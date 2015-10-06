import React, { Component, PropTypes } from "react";

import OnClickOutsideWrapper from "./OnClickOutsideWrapper.react";
import Tether from "tether";

import cx from "classnames";

const DEFAULT_TETHER_OPTIONS = {
    attachment: "top center",
    targetAttachment: "bottom center",
    targetOffset: "15px 0",
    optimizations: {
        moveElement: false // always moves to <body> anyway!
    }
};

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

            var tetherOptions = { ...DEFAULT_TETHER_OPTIONS, ...this.props.tetherOptions };

            tetherOptions.element = this._popoverElement;

            if (!tetherOptions.target && this.props.getTriggerTarget) {
                tetherOptions.target = React.findDOMNode(this.props.getTriggerTarget());
            }
            if (!tetherOptions.target) {
                tetherOptions.target = React.findDOMNode(this).parentNode;
            }

            this._setTetherOptions(tetherOptions);

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
    hasArrow: true,
    isHorizontal: false,
    attachmentsX: ["center", "left", "right"],
    attachmentsY: ["top", "bottom"]
};
