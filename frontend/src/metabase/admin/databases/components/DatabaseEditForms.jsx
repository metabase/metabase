import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import DatabaseDetailsForm from "metabase/components/DatabaseDetailsForm";
import { t } from "ttag";

export default class DatabaseEditForms extends Component {
  static propTypes = {
    database: PropTypes.object,
    details: PropTypes.object,
    engines: PropTypes.object.isRequired,
    hiddenFields: PropTypes.object,
    selectEngine: PropTypes.func.isRequired,
    save: PropTypes.func.isRequired,
    formState: PropTypes.object,
  };

  render() {
    const {
      database,
      details,
      hiddenFields,
      engines,
      formState: { formError, formSuccess, isSubmitting },
    } = this.props;

    const errors = {};
    return (
      <div className="mt4">
        <div
          className={cx("Form-field", { "Form--fieldError": errors["engine"] })}
        >
          <label className="Form-label">
            Database type: <span>{errors["engine"]}</span>
          </label>
          <label className="Select mt1">
            <select
              className="Select"
              defaultValue={database.engine}
              onChange={e => this.props.selectEngine(e.target.value)}
            >
              <option value="" disabled>{t`Select a database type`}</option>
              {Object.keys(engines)
                .sort()
                .map(opt => (
                  <option key={opt} value={opt}>
                    {engines[opt]["driver-name"]}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {database.engine ? (
          <DatabaseDetailsForm
            details={{
              ...details,
              name: database.name,
              is_full_sync: database.is_full_sync,
              auto_run_queries: database.auto_run_queries,
            }}
            engine={database.engine}
            engines={engines}
            formError={formError}
            formSuccess={formSuccess}
            hiddenFields={hiddenFields}
            submitFn={database =>
              this.props.save(
                {
                  ...database,
                  id: this.props.database.id,
                },
                database.details,
              )
            }
            isNewDatabase={!database.id}
            submitButtonText={t`Save`}
            submitting={isSubmitting}
          />
        ) : null}
      </div>
    );
  }
}
