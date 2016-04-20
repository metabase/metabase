import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import TooltipPopover from "./TooltipPopover.jsx";

export default class Tooltip extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            isOpen: false
        };

        this._onMouseEnter = this._onMouseEnter.bind(this);
        this._onMouseLeave = this._onMouseLeave.bind(this);
    }

    static propTypes = {
        tooltip: PropTypes.node.isRequired,
        children: PropTypes.element.isRequired,
        isEnabled: PropTypes.bool,
        verticalAttachments: PropTypes.array
    };

    static defaultProps = {
        isEnabled: true,
        verticalAttachments: ["top", "bottom"]
    };

    componentDidMount() {
        let elem = ReactDOM.findDOMNode(this);
        elem.addEventListener("mouseenter", this._onMouseEnter, false);
        elem.addEventListener("mouseleave", this._onMouseLeave, false);
        this._element = document.createElement('div');
        this.componentDidUpdate();
    }

    componentDidUpdate() {
        const { isEnabled } = this.props;
        const { isOpen } = this.state;
        if (isEnabled && isOpen) {
            ReactDOM.render(
                <TooltipPopover isOpen={true} target={this} {...this.props} children={this.props.tooltip} />,
                this._element
            );
        } else {
            ReactDOM.unmountComponentAtNode(this._element);
        }
    }

    componentWillUnmount() {
        let elem = ReactDOM.findDOMNode(this);
        elem.removeEventListener("mouseenter", this._onMouseEnter, false);
        elem.removeEventListener("mouseleave", this._onMouseLeave, false);
        ReactDOM.unmountComponentAtNode(this._element);
    }

    _onMouseEnter(e) {
        this.setState({ isOpen: true });
    }

    _onMouseLeave(e) {
        this.setState({ isOpen: false });
    }

    render() {
        return React.Children.only(this.props.children);
    }
}
