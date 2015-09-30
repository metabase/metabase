"use strict";

import React, { Component, PropTypes } from "react";


export default class PasswordReveal extends Component {

    constructor(props) {
        super(props);
        this.state = { visible: false };
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
            <div>
                { visible ?
                    <input type="text" value={password} />
                :
                    <input type="password" value={password} />
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
