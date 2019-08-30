import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t, jt } from "ttag";
import FormField from "metabase/components/form/FormField";
import FormLabel from "metabase/components/form/FormLabel";
import FormMessage from "metabase/components/form/FormMessage";
import Toggle from "metabase/components/Toggle";

import { shallowEqual } from "recompose";

// TODO - this should be somewhere more centralized
function isEmpty(str) {
  return !str || 0 === str.length;
}

const AUTH_URL_PREFIXES = {
  bigquery:
    "https://accounts.google.com/o/oauth2/auth?redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/bigquery&client_id=",
  bigquery_with_drive:
    "https://accounts.google.com/o/oauth2/auth?redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/bigquery%20https://www.googleapis.com/auth/drive&client_id=",
  googleanalytics:
    "https://accounts.google.com/o/oauth2/auth?access_type=offline&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/analytics.readonly&client_id=",
};

const ENABLE_API_PREFIXES = {
  googleanalytics:
    "https://console.developers.google.com/apis/api/analytics.googleapis.com/overview?project=",
};

const CREDENTIALS_URL_PREFIXES = {
  bigquery:
    "https://console.developers.google.com/apis/credentials/oauthclient?project=",
  googleanalytics:
    "https://console.developers.google.com/apis/credentials/oauthclient?project=",
};

const isTunnelField = field => /^tunnel-/.test(field.name);

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
      valid: false,
    };
  }

  static propTypes = {
    details: PropTypes.object,
    engine: PropTypes.string.isRequired,
    engines: PropTypes.object.isRequired,
    formError: PropTypes.object,
    hiddenFields: PropTypes.object,
    isNewDatabase: PropTypes.bool,
    submitButtonText: PropTypes.string.isRequired,
    submitFn: PropTypes.func.isRequired,
    submitting: PropTypes.bool,
  };

  validateForm() {
    const { engine, engines } = this.props;
    const { details } = this.state;

    let valid = true;

    // name is required
    if (!details.name) {
      valid = false;
    }

    // go over individual fields
    for (const field of engines[engine]["details-fields"]) {
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

  componentWillReceiveProps(nextProps) {
    if (!shallowEqual(this.props.details, nextProps.details)) {
      this.setState({ details: nextProps.details });
    }
  }

  componentDidMount() {
    this.validateForm();
  }

  componentDidUpdate() {
    this.validateForm();
  }

  onChange(fieldName, fieldValue) {
    this.setState({
      details: { ...this.state.details, [fieldName]: fieldValue },
    });
  }

  formSubmitted(e) {
    e.preventDefault();

    const { engine, engines, submitFn } = this.props;
    const { details } = this.state;

    const request = {
      engine: engine,
      name: details.name,
      details: {},
      // use the existing is_full_sync setting in case that "let user control scheduling" setting is enabled
      is_full_sync: details.is_full_sync,
      auto_run_queries: details.auto_run_queries,
    };

    for (const field of engines[engine]["details-fields"]) {
      let val = details[field.name] === "" ? null : details[field.name];

      if (val && field.type === "integer") {
        val = parseInt(val);
      }
      if (val == null && field.default) {
        val = field.default;
      }

      request.details[field.name] = val;
    }

    // NOTE Atte Keinänen 8/15/17: Is it a little hacky approach or not to add to the `details` field property
    // that are not part of the details schema of current db engine?
    request.details["let-user-control-scheduling"] =
      details["let-user-control-scheduling"];

    submitFn(request);
  }

  renderFieldInput(field, fieldIndex) {
    const { details } = this.state;
    const value = (details && details[field.name]) || "";

    switch (field.type) {
      case "boolean":
        return (
          <div className="Form-input Form-offset full Button-group">
            <div
              className={cx(
                "Button",
                details[field.name] === true ? "Button--active" : null,
              )}
              onClick={e => {
                this.onChange(field.name, true);
              }}
            >
              Yes
            </div>
            <div
              className={cx(
                "Button",
                details[field.name] === false ? "Button--danger" : null,
              )}
              onClick={e => {
                this.onChange(field.name, false);
              }}
            >
              No
            </div>
          </div>
        );
      default:
        return (
          <input
            type={field.type === "password" ? "password" : "text"}
            className="Form-input Form-offset full"
            ref={field.name}
            name={field.name}
            value={value}
            placeholder={field.default || field.placeholder}
            onChange={e => this.onChange(field.name, e.target.value)}
            required={field.required}
            autoFocus={fieldIndex === 0}
          />
        );
    }
  }

  renderField(field, fieldIndex) {
    const { engine, formError } = this.props;
    const { details } = this.state;
    window.ENGINE = engine;

    if (field.name === "tunnel-enabled") {
      const on =
        details["tunnel-enabled"] == undefined
          ? false
          : details["tunnel-enabled"];
      return (
        <FormField key={field.name} fieldName={field.name}>
          <div className="flex align-center Form-offset">
            <div className="Grid-cell--top">
              <Toggle
                value={on}
                onChange={val => this.onChange("tunnel-enabled", val)}
              />
            </div>
            <div className="px2">
              <h3>{t`Use an SSH-tunnel for database connections`}</h3>
              <div style={{ maxWidth: "40rem" }} className="pt1">
                {t`Some database installations can only be accessed by connecting through an SSH bastion host.
                                 This option also provides an extra layer of security when a VPN is not available.
                                 Enabling this is usually slower than a direct connection.`}
              </div>
            </div>
          </div>
        </FormField>
      );
    } else if (isTunnelField(field) && !details["tunnel-enabled"]) {
      // don't show tunnel fields if tunnel isn't enabled
      return null;
    } else if (field.name === "use-jvm-timezone") {
      const on =
        details["use-jvm-timezone"] == undefined
          ? false
          : details["use-jvm-timezone"];
      return (
        <FormField key={field.name} fieldName={field.name}>
          <div className="flex align-center Form-offset">
            <div className="Grid-cell--top">
              <Toggle
                value={on}
                onChange={val => this.onChange("use-jvm-timezone", val)}
              />
            </div>
            <div className="px2">
              <h3>{t`Use the Java Virtual Machine (JVM) timezone`}</h3>
              <div style={{ maxWidth: "40rem" }} className="pt1">
                {t`We suggest you leave this off unless you're doing manual timezone casting in
                                many or most of your queries with this data.`}
              </div>
            </div>
          </div>
        </FormField>
      );
    } else if (field.name === "use-srv") {
      const on = details["use-srv"] == null ? false : details["use-srv"];
      return (
        <FormField key={field.name} fieldName={field.name}>
          <div className="flex align-center Form-offset">
            <div className="Grid-cell--top">
              <Toggle
                value={on}
                onChange={val => this.onChange("use-srv", val)}
              />
            </div>
            <div className="px2">
              <h3>{t`Use DNS SRV when connecting`}</h3>
              <div style={{ maxWidth: "40rem" }} className="pt1">
                {t`Using this option requires that provided host is a FQDN.  If connecting to 
                an Atlas cluster, you might need to enable this option.  If you don't know what this means,
                leave this disabled.`}
              </div>
            </div>
          </div>
        </FormField>
      );
    } else if (field.name === "let-user-control-scheduling") {
      const on =
        details["let-user-control-scheduling"] == null
          ? false
          : details["let-user-control-scheduling"];
      return (
        <FormField key={field.name} fieldName={field.name}>
          <div className="flex align-center Form-offset">
            <div className="Grid-cell--top">
              <Toggle
                value={on}
                onChange={val =>
                  this.onChange("let-user-control-scheduling", val)
                }
              />
            </div>
            <div className="px2">
              <h3>{t`This is a large database, so let me choose when Metabase syncs and scans`}</h3>
              <div style={{ maxWidth: "40rem" }} className="pt1">
                {t`By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values.
                                If you have a large database, we recommend turning this on and reviewing when and how often the field value scans happen.`}
              </div>
            </div>
          </div>
        </FormField>
      );
    } else if (field.name === "auto_run_queries") {
      const on =
        details["auto_run_queries"] == null
          ? true
          : details["auto_run_queries"];
      return (
        <FormField key={field.name} fieldName={field.name}>
          <div className="flex align-center Form-offset">
            <div className="Grid-cell--top">
              <Toggle
                value={on}
                onChange={val => this.onChange("auto_run_queries", val)}
              />
            </div>
            <div className="px2">
              <h3>{t`Automatically run queries when doing simple filtering and summarizing`}</h3>
              <div style={{ maxWidth: "40rem" }} className="pt1">
                {t`When this is on, Metabase will automatically run queries when users do simple explorations with the Summarize and Filter buttons when viewing a table or chart. You can turn this off if querying this database is slow. This setting doesn’t affect drill-throughs or SQL queries.`}
              </div>
            </div>
          </div>
        </FormField>
      );
    } else if (field.name === "client-id" && CREDENTIALS_URL_PREFIXES[engine]) {
      const { details } = this.state;
      const projectID = details && details["project-id"];
      // if (projectID) {
      const credentialsURL =
        CREDENTIALS_URL_PREFIXES[engine] + (projectID || "");
      const credentialsURLLink = (
        <div className="flex align-center Form-offset">
          <div className="Grid-cell--top">
            {jt`${(
              <a className="link" href={credentialsURL} target="_blank">
                {t`Click here`}
              </a>
            )} to generate a Client ID and Client Secret for your project.`}
            {t`Choose "Other" as the application type. Name it whatever you'd like.`}
          </div>
        </div>
      );
      // }

      return (
        <FormField key="client-id" field-name="client-id">
          <FormLabel title={field["display-name"]} field-name="client-id" />
          {credentialsURLLink}
          {this.renderFieldInput(field, fieldIndex)}
        </FormField>
      );
    } else if (field.name === "auth-code" && AUTH_URL_PREFIXES[engine]) {
      const { details } = this.state;
      const clientID = details && details["client-id"];
      let authURLLink;
      if (clientID) {
        const authURL = AUTH_URL_PREFIXES[engine] + clientID;
        authURLLink = (
          <div className="flex align-center Form-offset">
            <div className="Grid-cell--top">
              {jt`${(
                <a className="link" href={authURL} target="_blank">
                  {t`Click here`}
                </a>
              )} to get an auth code`}
              {engine === "bigquery" && (
                <span>
                  {" "}
                  (or{" "}
                  <a
                    href={AUTH_URL_PREFIXES["bigquery_with_drive"] + clientID}
                    target="_blank"
                  >{t`with Google Drive permissions`}</a>
                  )
                </span>
              )}
            </div>
          </div>
        );
      }

      // for Google Analytics we need to show a link for people to go to the Console to enable the GA API
      let enableAPILink;
      // projectID is just the first numeric part of the clientID.
      // e.g. clientID might be 123436115855-q8z42hilmjf8iplnnu49n7jbudmxxdf.apps.googleusercontent.com
      // then projecID would be 12343611585
      const projectID = clientID && (clientID.match(/^\d+/) || [])[0];
      if (ENABLE_API_PREFIXES[engine] && projectID) {
        // URL looks like https://console.developers.google.com/apis/api/analytics.googleapis.com/overview?project=12343611585
        const enableAPIURL = ENABLE_API_PREFIXES[engine] + projectID;
        enableAPILink = (
          <div className="flex align-center Form-offset">
            <div className="Grid-cell--top">
              {t`To use Metabase with this data you must enable API access in the Google Developers Console.`}
            </div>
            <div className="Grid-cell--top ml1">
              {jt`${(
                <a href={enableAPIURL} target="_blank">
                  {t`Click here`}
                </a>
              )} to go to the console if you haven't already done so.`}
            </div>
          </div>
        );
      }

      return (
        <FormField key="auth-code" field-name="auth-code">
          <FormLabel title={field["display-name"]} field-name="auth-code" />
          {authURLLink}
          {this.renderFieldInput(field, fieldIndex)}
          {enableAPILink}
        </FormField>
      );
    } else {
      return (
        <FormField
          key={field.name}
          fieldName={field.name}
          formError={formError}
        >
          <FormLabel
            title={field["display-name"]}
            fieldName={field.name}
            formError={formError}
          />
          {this.renderFieldInput(field, fieldIndex)}
          <span className="Form-charm" />
        </FormField>
      );
    }
  }

  render() {
    let {
      engine,
      engines,
      formError,
      formSuccess,
      hiddenFields,
      submitButtonText,
      isNewDatabase,
      submitting,
    } = this.props;
    const { valid, details } = this.state;

    const willProceedToNextDbCreationStep =
      isNewDatabase && details["let-user-control-scheduling"];

    const fields = [
      {
        name: "name",
        "display-name": t`Name`,
        placeholder: t`How would you like to refer to this database?`,
        required: true,
      },
      ...engines[engine]["details-fields"],
      {
        name: "let-user-control-scheduling",
        required: true,
      },
      {
        name: "auto_run_queries",
        required: true,
      },
    ];

    hiddenFields = hiddenFields || {};

    if (formError && formError.data) {
      // If we have a field error but no matching field, use that field error as
      // a fallback for formError.data.message
      const { message, errors = {} } = formError.data;
      const fieldNames = new Set(fields.map(field => field.name));
      const [unusedFieldKey] = Object.keys(errors).filter(
        name => !fieldNames.has(name),
      );
      if (unusedFieldKey && !message) {
        formError.data.message = errors[unusedFieldKey];
      }
    }

    return (
      <form onSubmit={this.formSubmitted.bind(this)} noValidate>
        <div className="FormInputGroup pb2">
          {fields
            .filter(field => !hiddenFields[field.name])
            .map((field, fieldIndex) => this.renderField(field, fieldIndex))}
        </div>

        <div className="Form-actions">
          <button
            className={cx("Button", { "Button--primary": valid })}
            disabled={!valid || submitting}
          >
            {submitting
              ? t`Saving...`
              : willProceedToNextDbCreationStep
              ? t`Next`
              : submitButtonText}
          </button>
          <FormMessage formError={formError} formSuccess={formSuccess} />
        </div>
      </form>
    );
  }
}
