import React from "react";

import _ from "underscore";
import { t } from "ttag";
import cx from "classnames";

import { color } from "metabase/lib/colors";

import SchedulePicker from "metabase/components/SchedulePicker";

export default function CacheFieldValuesScheduleWidget({
  field,
  values,
  onChangeField,
}) {
  const setIsFullSyncIsOnDemand = (isFullSync, isOnDemand) => {
    onChangeField("is_full_sync", isFullSync);
    onChangeField("is_on_demand", isOnDemand);
  };
  return (
    <ol className="bordered shadowed mt3">
      <li className="border-bottom">
        <SyncOption
          selected={values.is_full_sync}
          name={t`Regularly, on a schedule`}
          select={() => setIsFullSyncIsOnDemand(true, false)}
        >
          <div className="flex align-center">
            <SchedulePicker
              schedule={
                !_.isString(field.value)
                  ? field.value
                  : {
                      schedule_day: "mon",
                      schedule_frame: null,
                      schedule_hour: 0,
                      schedule_type: "daily",
                    }
              }
              scheduleOptions={["daily", "weekly", "monthly"]}
              onScheduleChange={field.onChange}
              textBeforeInterval={t`Scan`}
            />
          </div>
        </SyncOption>
      </li>
      <li className="border-bottom pr2">
        <SyncOption
          selected={!values.is_full_sync && values.is_on_demand}
          name={t`Only when adding a new filter widget`}
          select={() => setIsFullSyncIsOnDemand(false, true)}
        >
          <p className="text-paragraph text-measure">
            {t`When a user adds a new filter to a dashboard or a SQL question, Metabase will
                                                  scan the field(s) mapped to that filter in order to show the list of selectable values.`}
          </p>
        </SyncOption>
      </li>
      <li>
        <SyncOption
          selected={!values.is_full_sync && !values.is_on_demand}
          name={t`Never, I'll do this manually if I need to`}
          select={() => setIsFullSyncIsOnDemand(false, false)}
        />
      </li>
    </ol>
  );
}

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
        borderColor: selected ? color("brand") : color("text-light"),
        borderStyle: "solid",
      }}
    >
      {selected && (
        <div
          className="circle"
          style={{
            width: 8,
            height: 8,
            backgroundColor: selected ? color("brand") : color("text-light"),
          }}
        />
      )}
    </div>
    <div className="ml4 pl2">
      <div className={cx({ "text-brand": selected })}>
        <h3>{name}</h3>
      </div>
      {selected && children && <div className="mt2">{children}</div>}
    </div>
  </div>
);
