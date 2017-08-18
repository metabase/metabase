import React, { Component } from "react";
import cx from "classnames";
import _ from "underscore";
import { assocIn } from "icepick";

import FormMessage from "metabase/components/form/FormMessage";

import SchedulePicker from "metabase/components/SchedulePicker";
import MetabaseAnalytics from "metabase/lib/analytics";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

export const SyncOption = ({ selected, name, description, children, select }) =>
    <div className={cx("py2 relative", {"cursor-pointer": !selected})} onClick={() => select(name.toLowerCase()) }>
        <div
            className={cx('circle ml2 flex align-center justify-center absolute')}
            style={{
                width: 18,
                height: 18,
                borderWidth: 2,
                borderColor: selected ? '#509ee3': '#ddd',
                borderStyle: 'solid'
            }}
        >
            { selected &&
                <div
                    className="circle"
                    style={{ width: 8, height: 8, backgroundColor: selected ? '#509ee3' : '#ddd' }}
                />
            }
        </div>
        <div className="Form-offset ml1">
            <div className={cx({ 'text-brand': selected })}>
                <h4>{name}, {description}</h4>
            </div>
            { selected && children && <div className="mt2">{children}</div> }
        </div>
    </div>


export default class DatabaseSchedulingForm extends Component {
    constructor(props) {
        super();

        this.state = {
            unsavedDatabase: props.database
        }
    }

    updateSchemaSyncSchedule = (newSchedule, changedProp) => {
        MetabaseAnalytics.trackEvent(
            "DatabaseSyncEdit",
            "SchemaSyncSchedule:" + changedProp.name,
            changedProp.value
        );

        this.setState(assocIn(this.state, ["unsavedDatabase", "schedules", "metadata_sync"], newSchedule));
    }

    updateFieldScanSchedule = (newSchedule, changedProp) => {
        MetabaseAnalytics.trackEvent(
            "DatabaseSyncEdit",
            "FieldScanSchedule:" + changedProp.name,
            changedProp.value
        );

        this.setState(assocIn(this.state, ["unsavedDatabase", "schedules", "cache_field_values"], newSchedule));
    }

    setIsFullSync = (isFullSync) => {
        // TODO: Add event tracking
        this.setState(assocIn(this.state, ["unsavedDatabase", "is_full_sync"], isFullSync));
    }

    onSubmitForm = (event) => {
        event.preventDefault();

        const { unsavedDatabase } = this.state
        this.props.save(unsavedDatabase, unsavedDatabase.details);
    }
    render() {
        const { submitButtonText, formState: { formError, formSuccess, isSubmitting } } = this.props
        const { unsavedDatabase } = this.state

        return (
            <LoadingAndErrorWrapper loading={!this.props.database} error={null}>
                { () =>
                    <form onSubmit={this.onSubmitForm} noValidate>

                        <div className="Form-offset mr4 mt4">
                            <div>
                                <div style={{maxWidth: 600}}>
                                    To do some of its magic, Metabase needs to scan your database. We will also rescan it periodically to keep the metadata up-to-date. You can control when the periodic rescans happen below.
                                </div>
                                <h4 className="mt4 text-bold text-uppercase">Database syncing</h4>
                                <p className="text-paragraph text-measure">This is a lightweight process that checks for
                                    updates to this database’s schema. In most cases, you should be fine leaving this
                                    set to sync hourly.</p>
                                <SchedulePicker
                                    schedule={!_.isString(unsavedDatabase.schedules && unsavedDatabase.schedules.metadata_sync)
                                            ? unsavedDatabase.schedules.metadata_sync
                                            : {
                                                schedule_day: "mon",
                                                schedule_frame: null,
                                                schedule_hour: 0,
                                                schedule_type: "daily"
                                            }
                                    }
                                    scheduleOptions={["hourly", "daily"]}
                                    onScheduleChange={this.updateSchemaSyncSchedule}
                                    textBeforeInterval="Scan"
                                />
                            </div>

                            <div className="mt4">
                                <h4 className="text-bold text-default text-uppercase">Scanning for Filter Values</h4>
                                <p className="text-paragraph text-measure">Metabase can scan the values present in each
                                    field in this database to enable checkbox filters in dashboards and questions. This
                                    can be a somewhat resource-intensive process, particularly if you have a very large
                                    database.</p>

                                  <h3>When should Metabase automatically scan and cache field values?</h3>
                                <ol className="bordered shadowed mt3">
                                    <li className="border-bottom">
                                        <SyncOption
                                            selected={unsavedDatabase.is_full_sync}
                                            name="Regularly"
                                            description="on a schedule"
                                            select={() => this.setIsFullSync(true)}
                                        >

                                            <div className="flex align-center">
                                                <SchedulePicker
                                                    schedule={!_.isString(unsavedDatabase.schedules && unsavedDatabase.schedules.cache_field_values)
                                                            ? unsavedDatabase.schedules.cache_field_values
                                                            : {
                                                                schedule_day: "mon",
                                                                schedule_frame: null,
                                                                schedule_hour: 0,
                                                                schedule_type: "daily"
                                                            }
                                                    }
                                                    scheduleOptions={["daily", "weekly", "monthly"]}
                                                    onScheduleChange={this.updateFieldScanSchedule}
                                                    textBeforeInterval="Scan"
                                                />
                                            </div>
                                        </SyncOption>
                                    </li>
                                    <li>
                                        <SyncOption
                                            selected={!unsavedDatabase.is_full_sync}
                                            name="Never"
                                            description="I'll do this manually if I need to"
                                            select={() => this.setIsFullSync(false)}
                                        />
                                    </li>
                                </ol>
                            </div>

                        </div>
                        <div className="Form-actions mt4">
                            <button className={"Button Button--primary"} disabled={isSubmitting}>
                                {isSubmitting ? "Saving..." : submitButtonText }
                            </button>
                            <FormMessage formError={formError} formSuccess={formSuccess}/>
                        </div>
                    </form>
                }
            </LoadingAndErrorWrapper>
        )
    }
}
