import React, { Component } from "react";
import cx from "classnames";
import _ from "underscore";

import FormMessage from "metabase/components/form/FormMessage";
import Select from "metabase/components/Select";

import SchedulePicker from "metabase/components/SchedulePicker";
import MetabaseAnalytics from "metabase/lib/analytics";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";


const DB_SYNC_OPTIONS = [
    { name: 'Hourly' },
    { name: 'Daily' }
]

export const SyncOption = ({ selected, name, description, children, select }) =>
    <div className="py2 relative" onClick={() => select(name.toLowerCase()) }>
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
            { selected && <div className="circle" style={{ width: 8, height: 8, backgroundColor: selected ? '#509ee3' : '#ddd' }}></div> }
        </div>
        <div className="Form-offset">
            <div className={cx({ 'text-brand': selected })}>
                <h3>{name} - {description}</h3>
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

        this.setState({
            unsavedDatabase: {
                ...this.state.unsavedDatabase,
                sync_schedule: newSchedule
            }
        })
    }

    updateFieldScanSchedule = (newSchedule, changedProp) => {
        MetabaseAnalytics.trackEvent(
            "DatabaseSyncEdit",
            "FieldScanSchedule:" + changedProp.name,
            changedProp.value
        );

        this.setState({
            unsavedDatabase: {
                ...this.state.unsavedDatabase,
                cache_field_values_schedule: newSchedule
            }
        })
    }

    setIsFullSyncAndIsStatic = (isFullSync, isStatic) => {
        // TODO: Add event tracking

        this.setState({
            unsavedDatabase: {
                ...this.state.unsavedDatabase,
                is_full_sync: isFullSync,
                details: {
                    ...this.state.unsavedDatabase.details,
                    is_static: isStatic
                }
            }
        })
    }

    onSubmitForm = (event) => {
        event.preventDefault();

        const { unsavedDatabase } = this.state
        this.props.save(unsavedDatabase, unsavedDatabase.details);
    }
    render() {
        const { formState: { formError, formSuccess } } = this.props
        const { unsavedDatabase } = this.state

        return (
            <LoadingAndErrorWrapper loading={!this.props.database} error={null}>
                { () =>
                    <form onSubmit={this.onSubmitForm} noValidate>

                        <div className="Form-offset mr4 mt4">
                            <div>
                                <h3>Database syncing</h3>
                                <p className="text-paragraph text-measure">This is a lightweight process that checks for
                                    updates to this database’s schema. In most cases, you should be fine leaving this
                                    set to sync hourly.</p>
                                <SchedulePicker
                                    schedule={!_.isString(unsavedDatabase.sync_schedule)
                                        ? unsavedDatabase.sync_schedule
                                        : {
                                            schedule_day: "mon",
                                            schedule_frame: null,
                                            schedule_hour: 0,
                                            schedule_type: "daily"
                                        }
                                    }
                                    scheduleOptions={["hourly", "daily"]}
                                    onScheduleChange={this.updateSchemaSyncSchedule}
                                />
                            </div>
                            <div className="mt2">
                                <h3>Field figerprinting</h3>
                                <p className="text-paragraph text-measure">Metabase can scan the values present in each
                                    field in this database to enable checkbox filters in dashboards and questions. This
                                    can be a somewhat resource-intensive process, particularly if you have a very large
                                    database.</p>

                                <h3>How often do the values in the tables of this database change?</h3>
                                <ol className="bordered shadowed mt2">
                                    <li className="border-bottom">
                                        <SyncOption
                                            selected={unsavedDatabase.is_full_sync}
                                            name="Often"
                                            description="Metabase should re-scan at regular intervals"
                                            select={() => this.setIsFullSyncAndIsStatic(true, false)}
                                        >

                                            <div className="flex align-center">
                                                <SchedulePicker
                                                    schedule={!_.isString(unsavedDatabase.cache_field_values_schedule)
                                                        ? unsavedDatabase.cache_field_values_schedule
                                                        : {
                                                            schedule_day: "mon",
                                                            schedule_frame: null,
                                                            schedule_hour: 0,
                                                            schedule_type: "daily"
                                                        }
                                                    }
                                                    scheduleOptions={["daily", "weekly", "monthly"]}
                                                    onScheduleChange={this.updateFieldScanSchedule}
                                                />
                                            </div>
                                        </SyncOption>
                                    </li>
                                    <li className="border-bottom">
                                        <SyncOption
                                            selected={!unsavedDatabase.is_full_sync && !unsavedDatabase.details.is_static}
                                            name="Rarely"
                                            description="Metabase should only re-scan when I tell it to manually"
                                            select={() => this.setIsFullSyncAndIsStatic(false, false)}
                                        />
                                    </li>
                                    <li>
                                        <SyncOption
                                            selected={!unsavedDatabase.is_full_sync && unsavedDatabase.details.is_static}
                                            name="Never"
                                            description="This is a static database"
                                            select={() => this.setIsFullSyncAndIsStatic(false, true)}
                                        />
                                    </li>
                                </ol>
                            </div>

                        </div>
                        <div className="Form-actions mt2">
                            <button className={"Button Button--primary"}>Save</button>
                            <FormMessage formError={formError} formSuccess={formSuccess}></FormMessage>
                        </div>
                    </form>
                }
            </LoadingAndErrorWrapper>
        )
    }
}
