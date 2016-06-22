import React, { Component, PropTypes } from "react";
import cx from "classnames";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import DatabaseDetailsForm from "metabase/components/DatabaseDetailsForm.jsx";


export default class DatabaseEditForms extends Component {

    static propTypes = {
        database: PropTypes.object,
        details: PropTypes.object,
        engines: PropTypes.object.isRequired,
        hiddenFields: PropTypes.object,
        selectEngine: PropTypes.func.isRequired,
        save: PropTypes.func.isRequired,
        formState: PropTypes.object
    };

    static defaultProps = {
        formSuccess: null,
        formError: null
    };

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
        let { database, details, hiddenFields, engines, formState: { formError, formSuccess } } = this.props;

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
                              submitFn={(database) => this.detailsCaptured(database)}
                              submitButtonText={'Save'}>
                          </DatabaseDetailsForm>
                          : null }
                    </div>
                }
            </LoadingAndErrorWrapper>
        );
    }
}
