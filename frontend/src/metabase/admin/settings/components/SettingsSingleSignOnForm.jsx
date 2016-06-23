import React, { Component, PropTypes } from "react";

import _ from "underscore";

import CheckBox from "metabase/components/CheckBox.jsx";
import Input from "metabase/components/Input.jsx";

export default class SettingsSingleSignOnForm extends Component {
    constructor(props, context) {
        super(props, context);
        this.updateClientID = this.updateClientID.bind(this);
        this.updateDomain = this.updateDomain.bind(this);
        this.onCheckboxClicked = this.onCheckboxClicked.bind(this);
    }

    static propTypes = {
        elements: PropTypes.array,
        updateSetting: PropTypes.func.isRequired
    };

    componentWillMount() {
        let { elements } = this.props;

        this.setState({
            clientID: _.findWhere(elements, {key: 'google-auth-client-id'}),
            domain:   _.findWhere(elements, {key: 'google-auth-auto-create-accounts-domain'})
        });
    }

    updateClientID(newValue) {
        if (newValue === this.state.clientID.value) return;

        this.setState({
            clientID: {
                value: newValue && newValue.length ? newValue : null
            }
        });

        this.props.updateSetting(this.state.clientID, newValue);
    }

    updateDomain(newValue) {
        if (newValue === this.state.domain.value) return;

        this.setState({
            domain: {
                value: newValue && newValue.length ? newValue : null
            }
        });

        this.props.updateSetting(this.state.domain, newValue);
    }

    onCheckboxClicked() {
        console.log('onCheckboxClicked()');
        // clear out the domain if one is present
        if (!this.state.domain.value) return;

        this.setState({
            domain: {
                value: null
            }
        })
    }

    render() {
        return (
            <form noValidate>
                <div className="px2"
                     style={{maxWidth: "585px"}}>
                    <h1>
                        Sign in with Google
                    </h1>
                    <div className="py2">
                        Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.
                    </div>
                    <Input
                        className="SettingsInput AdminInput bordered rounded h3"
                        type="text"
                        value={this.state.clientID.value}
                        placeholder="534278061337-lrsutnnp2g06ltqoql6f1p2njk8h2b4se.apps.googleusercontent.com"
                        onBlurChange={(event) => this.updateClientID(event.target.value)}
                    />
                    <div className="py3">
                        <CheckBox
                            className="inline-block pr2"
                            style={{verticalAlign: "top"}}
                            checked={!!this.state.domain.value}
                            onChange={this.onCheckboxClicked}
                            size={20}
                        />
                        <div className="inline-block">
                            Allow users to sign up on their own if their Google account email address is from:
                            <div className="my2 bordered rounded">
                                <div className="inline-block px2 h2">
                                    @
                                </div>
                                <Input
                                    className="SettingsInput AdminInput h3 border-left"
                                    type="text"
                                    value={this.state.domain.value}
                                    onBlurChange={(event) => this.updateDomain(event.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        );
    }
}
