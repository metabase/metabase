import React, { Component, PropTypes } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import DatabaseDetailsForm from "metabase/components/database/DatabaseDetailsForm.jsx";

import cx from "classnames";

export default class DatabaseEditForms extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            formSuccess: null,
            formError: null
        };
    }

    static propTypes = {
        database: PropTypes.object,
        details: PropTypes.object,
        engines: PropTypes.object.isRequired,
        hiddenFields: PropTypes.object,
        save: PropTypes.func.isRequired
    };
    static defaultProps = {};

    async detailsCaptured(database) {
        this.setState({ formError: null, formSuccess: null })
        try {
            await this.props.save({ ...database, id: this.props.database.id }, database.details);
            // this object format is what FormMessage expects:
            this.setState({ formSuccess: { data: { message: "Successfully saved!" }}});
        } catch (error) {
            this.setState({ formError: error })
        }
    }

    render() {
        let { database, details, hiddenFields, engines } = this.props;
        let { formError, formSuccess } = this.state;

        let errors = {};
        return (
            <LoadingAndErrorWrapper loading={!database} error={null}>
                {() =>
                    <div>
                        <div className={cx("Form-field", { "Form--fieldError": errors["engine"] })}>
                            <label className="Form-label Form-offset">Database type: <span>{errors["engine"]}</span></label>
                            <label className="Select Form-offset mt1">
                                <select className="Select" defaultValue={database.engine} onChange={(e) => this.props.selectEngine(e.target.value)}>
                                    <option value="" disabled>Select a database type</option>
                                    {Object.keys(engines).sort().map(opt => <option key={opt} value={opt}>{engines[opt]['driver-name']}</option>)}
                                </select>
                            </label>
                        </div>

                        { database.engine ?
                          <DatabaseDetailsForm
                              details={{ ...details, name: database.name, is_full_sync: database.is_full_sync }}
                              engine={database.engine}
                              engines={engines}
                              formError={formError}
                              formSuccess={formSuccess}
                              hiddenFields={hiddenFields}
                              submitFn={this.detailsCaptured.bind(this)}
                              submitButtonText={'Save'}>
                          </DatabaseDetailsForm>
                          : null }
                    </div>
                }
            </LoadingAndErrorWrapper>
        );
    }
}
