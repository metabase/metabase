import { connect } from "react-redux";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";
import SchedulePicker, {
  SchedulePickerProps,
} from "metabase/components/SchedulePicker";

type StateProps = {
  timezone?: string;
};

function mapStateToProps(state: State): StateProps {
  return {
    timezone: getSetting(state, "report-timezone-short"),
  };
}

export * from "metabase/components/SchedulePicker";

export default connect<
  StateProps,
  unknown,
  Omit<SchedulePickerProps, "timezone">,
  State
>(mapStateToProps)(SchedulePicker);
