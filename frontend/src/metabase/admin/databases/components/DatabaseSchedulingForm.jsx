import React, { Component } from "react";
import cx from "classnames";
import _ from "underscore";
import { assocIn } from "icepick";
import { t } from "c-3po";

import FormMessage from "metabase/components/form/FormMessage";
import SchedulePicker from "metabase/components/SchedulePicker";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import MetabaseAnalytics from "metabase/lib/analytics";
import colors from "metabase/lib/colors";

export const SyncOption = ({ selected, name, children, select }) => (
  <div
    className={cx("py3 relative", { "cursor-pointer": !selected })}
    onClick={() => select(name.toLowerCase())}
  >
    <div
      className={cx("circle ml2 flex align-center justify-center absolute")}
      style={{
        width: 18,
        height: 18,
        borderWidth: 2,
        borderColor: selected ? colors["brand"] : colors["text-light"],
        borderStyle: "solid",
      }}
    >
      {selected && (
        <div
          className="circle"
          style={{
            width: 8,
            height: 8,
            backgroundColor: selected ? colors["brand"] : colors["text-light"],
          }}
        />
      )}
    </div>
    <div className="Form-offset ml1">
      <div className={cx({ "text-brand": selected })}>
        <h3>{name}</h3>
      </div>
      {selected && children && <div className="mt2">{children}</div>}
    </div>
  </div>
);

export default class DatabaseSchedulingForm extends Component {
  constructor(props) {
    super();

    this.state = {
      unsavedDatabase: props.database,
    };
  }

  updateSchemaSyncSchedule = (newSchedule, changedProp) => {
    MetabaseAnalytics.trackEvent(
      "DatabaseSyncEdit",
      "SchemaSyncSchedule:" + changedProp.name,
      changedProp.value,
    );

    this.setState(
      assocIn(
        this.state,
        ["unsavedDatabase", "schedules", "metadata_sync"],
        newSchedule,
      ),
    );
  };

  updateFieldScanSchedule = (newSchedule, changedProp) => {
    MetabaseAnalytics.trackEvent(
      "DatabaseSyncEdit",
      "FieldScanSchedule:" + changedProp.name,
      changedProp.value,
    );

    this.setState(
      assocIn(
        this.state,
        ["unsavedDatabase", "schedules", "cache_field_values"],
        newSchedule,
      ),
    );
  };

  setIsFullSyncIsOnDemand = (isFullSync, isOnDemand) => {
    // TODO: Add event tracking
    let state = assocIn(
      this.state,
      ["unsavedDatabase", "is_full_sync"],
      isFullSync,
    );
    state = assocIn(state, ["unsavedDatabase", "is_on_demand"], isOnDemand);
    this.setState(state);
  };

  onSubmitForm = event => {
    event.preventDefault();

    const { unsavedDatabase } = this.state;
    this.props.save(unsavedDatabase, unsavedDatabase.details);
  };

  render() {
    const {
      submitButtonText,
      formState: { formError, formSuccess, isSubmitting },
    } = this.props;
    const { unsavedDatabase } = this.state;

    return (
      <LoadingAndErrorWrapper loading={!this.props.database} error={null}>
        {() => (
          <form onSubmit={this.onSubmitForm} noValidate>
            <div className="Form-offset mr4 mt4">
              <div style={{ maxWidth: 600 }} className="border-bottom pb2">
                <p className="text-paragraph text-measure">
                  {t`To do some of its magic, Metabase needs to scan your database. We will also rescan it periodically to keep the metadata up-to-date. You can control when the periodic rescans happen below.`}
                </p>
              </div>

              <div className="border-bottom pb4">
                <h4 className="mt4 text-bold text-uppercase">{t`Database syncing`}</h4>
                <p className="text-paragraph text-measure">{t`This is a lightweight process that checks for
                                    updates to this database’s schema. In most cases, you should be fine leaving this
                                    set to sync hourly.`}</p>
                <SchedulePicker
                  schedule={
                    !_.isString(
                      unsavedDatabase.schedules &&
                        unsavedDatabase.schedules.metadata_sync,
                    )
                      ? unsavedDatabase.schedules.metadata_sync
                      : {
                          schedule_day: "mon",
                          schedule_frame: null,
                          schedule_hour: 0,
                          schedule_type: "daily",
                        }
                  }
                  scheduleOptions={["hourly", "daily"]}
                  onScheduleChange={this.updateSchemaSyncSchedule}
                  textBeforeInterval={t`Scan`}
                />
              </div>

              <div className="mt4">
                <h4 className="text-bold text-default text-uppercase">{t`Scanning for Filter Values`}</h4>
                <p className="text-paragraph text-measure">{t`Metabase can scan the values present in each
                                    field in this database to enable checkbox filters in dashboards and questions. This
                                    can be a somewhat resource-intensive process, particularly if you have a very large
                                    database.`}</p>

                <h3
                >{t`When should Metabase automatically scan and cache field values?`}</h3>
                <ol className="bordered shadowed mt3">
                  <li className="border-bottom">
                    <SyncOption
                      selected={unsavedDatabase.is_full_sync}
                      name={t`Regularly, on a schedule`}
                      select={() => this.setIsFullSyncIsOnDemand(true, false)}
                    >
                      <div className="flex align-center">
                        <SchedulePicker
                          schedule={
                            !_.isString(
                              unsavedDatabase.schedules &&
                                unsavedDatabase.schedules.cache_field_values,
                            )
                              ? unsavedDatabase.schedules.cache_field_values
                              : {
                                  schedule_day: "mon",
                                  schedule_frame: null,
                                  schedule_hour: 0,
                                  schedule_type: "daily",
                                }
                          }
                          scheduleOptions={["daily", "weekly", "monthly"]}
                          onScheduleChange={this.updateFieldScanSchedule}
                          textBeforeInterval={t`Scan`}
                        />
                      </div>
                    </SyncOption>
                  </li>
                  <li className="border-bottom pr2">
                    <SyncOption
                      selected={
                        !unsavedDatabase.is_full_sync &&
                        unsavedDatabase.is_on_demand
                      }
                      name={t`Only when adding a new filter widget`}
                      select={() => this.setIsFullSyncIsOnDemand(false, true)}
                    >
                      <p className="text-paragraph text-measure">
                        {t`When a user adds a new filter to a dashboard or a SQL question, Metabase will
                                                scan the field(s) mapped to that filter in order to show the list of selectable values.`}
                      </p>
                    </SyncOption>
                  </li>
                  <li>
                    <SyncOption
                      selected={
                        !unsavedDatabase.is_full_sync &&
                        !unsavedDatabase.is_on_demand
                      }
                      name={t`Never, I'll do this manually if I need to`}
                      select={() => this.setIsFullSyncIsOnDemand(false, false)}
                    />
                  </li>
                </ol>
              </div>
            </div>
            <div className="Form-actions mt4">
              <button
                className={"Button Button--primary"}
                disabled={isSubmitting}
              >
                {isSubmitting ? t`Saving...` : submitButtonText}
              </button>
              <FormMessage formError={formError} formSuccess={formSuccess} />
            </div>
          </form>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
