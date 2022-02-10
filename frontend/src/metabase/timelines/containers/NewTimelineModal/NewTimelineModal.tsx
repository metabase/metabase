import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import Collections from "metabase/entities/collections";
import NewTimelineModal from "../../components/NewTimelineModal";
import { createTimeline } from "../../actions";
import { getCollectionId } from "../../selectors";

const mapDispatchToProps = {
  onSubmit: createTimeline,
  onChangeLocation: push,
};

export default _.compose(
  Collections.load({ id: getCollectionId }),
  connect(null, mapDispatchToProps),
)(NewTimelineModal);
