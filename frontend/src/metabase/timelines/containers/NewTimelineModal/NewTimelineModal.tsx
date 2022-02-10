import { connect } from "react-redux";
import _ from "underscore";
import Collections from "metabase/entities/collections";
import { Timeline } from "metabase-types/api";
import NewTimelineModal from "../../components/NewTimelineModal";
import { createTimeline, setMode } from "../../actions";
import { getCollectionId } from "../../selectors";

const mapDispatchToProps = (dispatch: any) => ({
  onSubmit: (values: Partial<Timeline>) => dispatch(createTimeline(values)),
  onCancel: () => dispatch(setMode("timeline-list")),
});

export default _.compose(
  Collections.load({ id: getCollectionId }),
  connect(null, mapDispatchToProps),
)(NewTimelineModal);
