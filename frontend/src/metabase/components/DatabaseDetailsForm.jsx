import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import FormField from "metabase/components/form/FormField.jsx";
import FormLabel from "metabase/components/form/FormLabel.jsx";
import FormMessage from "metabase/components/form/FormMessage.jsx";
import Toggle from "metabase/components/Toggle.jsx";


// TODO - this should be somewhere more centralized
function isEmpty(str) {
    return (!str || 0 === str.length);
}

const AUTH_URL_PREFIXES = {
    bigquery: 'https://accounts.google.com/o/oauth2/auth?redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/bigquery&client_id=',
    bigquery_with_drive: 'https://accounts.google.com/o/oauth2/auth?redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/bigquery%20https://www.googleapis.com/auth/drive&client_id=',
    googleanalytics: 'https://accounts.google.com/o/oauth2/auth?access_type=offline&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/analytics.readonly&client_id=',
};

const CREDENTIALS_URL_PREFIXES = {
    bigquery: 'https://console.developers.google.com/apis/credentials/oauthclient?project=',
    googleanalytics: 'https://console.developers.google.com/apis/credentials/oauthclient?project=',
};

const isTunnelField = (field) => /^tunnel-/.test(field.name);

/**
 * This is a form for capturing database details for a given `engine` supplied via props.
 * The intention is to encapsulate the entire <form> with standard MB form styling and allow a callback
 * function to receive the captured form input when the form is submitted.
 */
export default class DatabaseDetailsForm extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            details: props.details || {},
            valid: false
        }
    }

    static propTypes = {
        details: PropTypes.object,
        engine: PropTypes.string.isRequired,
        engines: PropTypes.object.isRequired,
        formError: PropTypes.object,
        hiddenFields: PropTypes.object,
        submitButtonText: PropTypes.string.isRequired,
        submitFn: PropTypes.func.isRequired
    };

    validateForm() {
        let { engine, engines } = this.props;
        let { details } = this.state;

        let valid = true;

        // name is required
        if (!details.name) {
            valid = false;
        }

        // go over individual fields
        for (let field of engines[engine]['details-fields']) {
            // tunnel fields aren't required if tunnel isn't enabled
            if (!details["tunnel-enabled"] && isTunnelField(field)) {
                continue;
            } else if (field.required && isEmpty(details[field.name])) {
                valid = false;
                break;
            }
        }

        if (this.state.valid !== valid) {
            this.setState({ valid });
        }
    }

    componentDidMount() {
        this.validateForm();
    }

    componentDidUpdate() {
        this.validateForm();
    }

    onChange(fieldName, fieldValue) {
        this.setState({ details: { ...this.state.details, [fieldName]: fieldValue }});
    }

    formSubmitted(e) {
        e.preventDefault();

        let { engine, engines, submitFn } = this.props;
        let { details } = this.state;

        let request = {
            engine: engine,
            name: details.name,
            details: {},
            is_full_sync: details.is_full_sync,
            sync_schedule: details.sync_schedule,
            cache_field_values_schedule: details.cache_field_values_schedule,
            analyze_schedule: details.analyze_schedule,
            classify_schedule: details.classify_schedule
        };

        for (let field of engines[engine]['details-fields']) {
            let val = details[field.name] === "" ? null : details[field.name];

            if (val && field.type === 'integer') val = parseInt(val);
            if (val == null && field.default)    val = field.default;

            request.details[field.name] = val;
        }

        submitFn(request);
    }

    renderFieldInput(field, fieldIndex) {
        let { details } = this.state;
        let value = details && details[field.name] || "";

        switch(field.type) {
            case 'boolean':
                return (
                    <div className="Form-input Form-offset full Button-group">
                        <div className={cx('Button', details[field.name] === true ? 'Button--active' : null)} onClick={(e) => { this.onChange(field.name, true) }}>
                            Yes
                        </div>
                        <div className={cx('Button', details[field.name] === false ? 'Button--danger' : null)} onClick={(e) => { this.onChange(field.name, false) }}>
                            No
                        </div>
                    </div>
                );
            default:
                return (
                    <input
                        type={field.type === 'password' ? 'password' : 'text'}
                        className="Form-input Form-offset full"
                        ref={field.name}
                        name={field.name}
                        value={value}
                        placeholder={field.default || field.placeholder}
                        onChange={(e) => this.onChange(field.name, e.target.value)}
                        required={field.required}
                        autoFocus={fieldIndex === 0}
                    />
                );
        }
    }

    renderField(field, fieldIndex) {
        let { engine } = this.props;
        window.ENGINE = engine;

        if (field.name === "tunnel-enabled") {
            let on = (this.state.details["tunnel-enabled"] == undefined) ? false : this.state.details["tunnel-enabled"];
            return (
                <FormField key={field.name} fieldName={field.name}>
                    <div className="flex align-center Form-offset">
                        <div className="Grid-cell--top">
                            <Toggle value={on} onChange={(val) => this.onChange("tunnel-enabled", val)}/>
                        </div>
                        <div className="px2">
                            <h3>Use an SSH-tunnel for database connections</h3>
                            <div style={{maxWidth: "40rem"}} className="pt1">
                                 Some database installations can only be accessed by connecting through an SSH bastion host.
                                 This option also provides an extra layer of security when a VPN is not available.
                                 Enabling this is usually slower than a direct connection.
                            </div>
                        </div>
                    </div>
                </FormField>
            )
        } else if (isTunnelField(field) && !this.state.details["tunnel-enabled"]) {
            // don't show tunnel fields if tunnel isn't enabled
            return null;
        } else if (field.name === "is_full_sync") {
            let on = (this.state.details.is_full_sync == undefined) ? true : this.state.details.is_full_sync;
            return (
                <FormField key={field.name} fieldName={field.name}>
                    <div className="flex align-center Form-offset">
                        <div className="Grid-cell--top">
                            <Toggle value={on} onChange={(val) => this.onChange("is_full_sync", val)}/>
                        </div>
                        <div className="px2">
                            {/* TODO: Disable this for the database editing */}
                            <h3>Enable in-depth database analysis</h3>
                            <div style={{maxWidth: "40rem"}} className="pt1">
                                This allows us to present you with better metadata for your tables and is required for some features of Metabase.
                                We recommend leaving this on unless your database is large and you're concerned about performance.
                            </div>
                        </div>
                    </div>
                </FormField>
            );
        } else if (field.name === 'client-id' && CREDENTIALS_URL_PREFIXES[engine]) {
            let { details } = this.state;
            let projectID = details && details['project-id'];
            var credentialsURLLink;
            // if (projectID) {
                let credentialsURL = CREDENTIALS_URL_PREFIXES[engine] + (projectID || "");
                credentialsURLLink = (
                    <div className="flex align-center Form-offset">
                        <div className="Grid-cell--top">
                            <a href={credentialsURL} target='_blank'>Click here</a> to generate a Client ID and Client Secret for your project.
                            Choose "Other" as the application type. Name it whatever you'd like.
                        </div>
                    </div>);
            // }

            return (
                <FormField key='client-id' field-name='client-id'>
                    <FormLabel title={field['display-name']} field-name='client-id'></FormLabel>
                    {credentialsURLLink}
                    {this.renderFieldInput(field, fieldIndex)}
                </FormField>
            );
        } else if (field.name === 'auth-code' && AUTH_URL_PREFIXES[engine]) {
            let { details } = this.state;
            let clientID = details && details['client-id'];
            var authURLLink;
            if (clientID) {
                let authURL = AUTH_URL_PREFIXES[engine] + clientID;
                authURLLink = (
                    <div className="flex align-center Form-offset">
                        <div className="Grid-cell--top">
                            <a href={authURL} target='_blank'>Click here</a> to get an auth code
                            { engine === "bigquery" &&
                                <span> (or <a href={AUTH_URL_PREFIXES["bigquery_with_drive"] + clientID} target='_blank'>with Google Drive permissions</a>)</span>
                            }
                        </div>
                    </div>);
            }

            return (
                <FormField key='auth-code' field-name='auth-code'>
                    <FormLabel title={field['display-name']} field-name='auth-code'></FormLabel>
                    {authURLLink}
                    {this.renderFieldInput(field, fieldIndex)}
                </FormField>
            );
        } else {
            return (
                <FormField key={field.name} fieldName={field.name}>
                    <FormLabel title={field['display-name']} fieldName={field.name}></FormLabel>
                    {this.renderFieldInput(field, fieldIndex)}
                    <span className="Form-charm"></span>
                </FormField>
            );
        }
    }

    render() {
        let { engine, engines, formError, formSuccess, hiddenFields, submitButtonText } = this.props;
        let { valid } = this.state;

        let fields = [
            {
                name: 'name',
                'display-name': 'Name',
                placeholder: "How would you like to refer to this database?",
                required: true
            },
            ...engines[engine]['details-fields'],
            {
                name: "is_full_sync",
                required: true
            },
            {
                name: "sync_schedule",
                'display-name': "DATBASE SYNC",
                description: "How Often should Metabase check for updated to this database's schema",
                placeholder: "0 00 * * * ? *",
                required: false
            },
            {
                name: "cache_field_values_schedule",
                'display-name': "SCAN FIELD VALUES",
                description: "Metabase can scan the values of fields in this datbase to enable things like better filters. How often should we scan for these valuesaf?",
                placeholder: "0 10 * * * ? *",
                required: false
            },
            {
                name: "analyze_schedule",
                'display-name': "IN-DEPTH ANALYSIS",
                description: "This allows us to present you with better metadata for your tables and is required for some features of Metabase. How often should Metabase perfomr this analysis?",
                placeholder: "0 30 * * * ? *",
                required: false
            },
            {
                name: "classify_schedule",
                'display-name': "CLASSIFICATION SCHEDULE",
                placeholder: "0 50 * * * ? *",
                required: false
            }
        ];

        hiddenFields = hiddenFields || {};

        return (
            <form onSubmit={this.formSubmitted.bind(this)} noValidate>
                <div className="FormInputGroup pb2">
                    { fields.filter(field => !hiddenFields[field.name]).map((field, fieldIndex) =>
                        this.renderField(field, fieldIndex)
                      )}
                </div>

                <div className="Form-actions">
                    <button className={cx("Button", {"Button--primary": valid})} disabled={!valid}>
                        {submitButtonText}
                    </button>
                    <FormMessage formError={formError} formSuccess={formSuccess}></FormMessage>
                </div>
            </form>
        );
    }
}
