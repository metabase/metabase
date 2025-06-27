import { connect } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

import type { SchedulePickerProps } from "./SchedulePickerView";
import SchedulePicker from "./SchedulePickerView";

type StateProps = {
  timezone?: string;
};

function mapStateToProps(state: State): StateProps {
  return {
    timezone: getSetting(state, "report-timezone-short"),
  };
}

export * from "metabase/common/components/SchedulePicker";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<
  StateProps,
  unknown,
  Omit<SchedulePickerProps, "timezone">,
  State
>(mapStateToProps)(SchedulePicker);
