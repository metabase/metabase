import React, { Component } from "react";

import BodyComponent from "metabase/components/BodyComponent.jsx";

@BodyComponent
export default class Portal extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            target: null,
            position: { top: 0, left: 0, height: 0, width: 0 }
        };
    }

    static defaultProps = {
        padding: 10
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        if (newProps.target !== this.state.target) {
            const { target, padding } = newProps;
            let position;
            if (target === true) {
                position = {
                    top: this.state.position.top + this.state.position.height / 2,
                    left: this.state.position.left + this.state.position.width / 2,
                    width: -padding * 2,
                    height: -padding * 2
                }
            } else if (target) {
                position = target.getBoundingClientRect();
            }
            this.setState({ target, position: position || { top: 0, left: 0, height: 0, width: 0 } });
        }
    }

    getStyles(position) {
        const { padding } = this.props;
        return {
            position: "absolute",
            boxSizing: "content-box",
            border: "10000px solid rgba(0,0,0,0.70)",
            boxShadow: "inset 0px 0px 8px rgba(0,0,0,0.25)",
            transform: "translate(-10000px, -10000px)",
            borderRadius: "10010px",
            pointerEvents: "none",
            transition: position.width < 0 ? "all 0.25s ease-in-out" : "all 0.5s ease-in-out",
            top: position.top - padding,
            left: position.left - padding,
            width: position.width + 2 * padding,
            height: position.height + 2 * padding
        };
    }

    render() {
        if (!this.props.target) {
            return <div className="hide" />;
        }
        return (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", pointerEvents: "none" }}>
                <div style={this.getStyles(this.state.position)}/>
            </div>
        );
    }
}
