import React, { Component, PropTypes } from "react";

import OnClickOutsideWrapper from "./OnClickOutsideWrapper.react";
import Tether from "tether";

export default class Popover extends Component {
    constructor(props) {
        super(props);
        this.state = {};
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
            <OnClickOutsideWrapper handleClickOutside={this.handleClickOutside.bind(this)}>
                <div className={this.props.className}>
                    {this.props.children}
                </div>
            </OnClickOutsideWrapper>
        );
    }

    _tetherOptions() {
        // sensible defaults for most popovers
        return {
            attachment: 'bottom right',
            targetAttachment: 'top right',
            targetOffset: '10px 0',
            optimizations: {
                moveElement: false // always moves to <body> anyway!
            }
        };
    }

    _renderPopover() {
        if (this.props.isOpen) {
            // popover is open, lets do this!
            React.render(
                <div className="Popover-backdrop">
                    {this._popoverComponent()}
                </div>
            , this._popoverElement);

            var tetherOptions = this.props.tetherOptions || this._tetherOptions();

            // NOTE: these must be set here because they relate to OUR component and can't be passed in
            tetherOptions.element = this._popoverElement;
            tetherOptions.target = React.findDOMNode(this).parentNode;

            if (this._tether !== undefined && this._tether !== null) {
                this._tether.setOptions(tetherOptions);
            } else {
                this._tether = new Tether(tetherOptions);
            }
        } else {
            // if the popover isn't open then actively unmount our popover
            React.unmountComponentAtNode(this._popoverElement);
        }
    }

    render() {
        return <span />;
    }
}

Popover.propTypes = {
    isOpen: PropTypes.bool
};

Popover.defaultProps = {
    className: "Popover",
    isOpen: true
};
