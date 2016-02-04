import React, { Component, PropTypes } from "react";


export default class PasswordReveal extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = { visible: false };

        this.styles = {
            container: {
                borderWidth: "2px"
            },

            input: {
                fontSize: '1.2rem',
                letterSpacing: '2',
                color: '#676C72'
            },

            label: {
                top: "-12px"
            }
        }
    }

    static propTypes = {
        password: PropTypes.string.isRequired
    };

    onToggleVisibility() {
        this.setState({
            visible: !this.state.visible
        });
    }

    render() {
        const { password } = this.props;
        const { visible } = this.state;

        return (
            <div style={this.styles.container} className="bordered rounded p3 relative">
                <div style={this.styles.label} className="absolute text-centered left right">
                    <span className="px1 bg-white h6 text-bold text-grey-3 text-uppercase">Temporary Password</span>
                </div>

                { visible ?
                    <span style={this.styles.input} className="text-grey-2 text-normal mr3">{password}</span>
                :
                    <span style={this.styles.input} className="mr3">&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;</span>
                }

                { visible ?
                    <a className="link text-bold" onClick={this.onToggleVisibility.bind(this)}>Hide</a>
                :
                    <a className="link text-bold" onClick={this.onToggleVisibility.bind(this)}>Show</a>
                }
            </div>
        );
    }
}
