"use strict";

import React, { Component, PropTypes } from "react";


export default class PasswordReveal extends Component {

    constructor(props) {
        super(props);

        this.state = { visible: false };

        this.styles = {
            container: {
                borderWidth: "2px"
            },

            input: {
                border: "none",
                padding: "0.5em"
            },

            label: {
                top: "-12px"
            }
        }
    }

    onToggleVisibility() {
        this.setState({
            visible: !this.state.visible
        });
    }

    render() {
        const { password } = this.props;
        const { visible } = this.state;

        return (
            <div style={this.styles.container} className="bordered rounded p2 relative">
                <div style={this.styles.label} className="absolute text-centered left right">
                    <span className="px1 bg-white h6 text-bold text-grey-3 text-uppercase">Temporary Password</span>
                </div>

                { visible ?
                    <input style={this.styles.input} className="text-grey-2 text-normal" type="text" value={password} />
                :
                    <input style={this.styles.input} type="password" value={password} />
                }

                { visible ?
                    <a href="#" className="link" onClick={this.onToggleVisibility.bind(this)}>Hide</a>
                :
                    <a href="#" className="link" onClick={this.onToggleVisibility.bind(this)}>Show</a>
                }
            </div>
        );
    }
}

PasswordReveal.propTypes = {
    password: PropTypes.string.isRequired
}
