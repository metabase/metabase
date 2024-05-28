import { connect } from "react-redux";

import type { SchedulePickerProps } from "metabase/components/SchedulePicker";
import SchedulePicker from "metabase/components/SchedulePicker";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

type StateProps = {
  timezone?: string;
};

function mapStateToProps(state: State): StateProps {
  return {
    timezone: getSetting(state, "report-timezone-short"),
  };
}

export * from "metabase/components/SchedulePicker";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<
  StateProps,
  unknown,
  Omit<SchedulePickerProps, "timezone">,
  State
>(mapStateToProps)(SchedulePicker);
