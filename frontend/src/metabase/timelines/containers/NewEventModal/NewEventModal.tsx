import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import Collections from "metabase/entities/collections";
import Timelines from "metabase/entities/timelines";
import NewEventModal from "../../components/NewEventModal";
import { createEvent } from "../../actions";
import { getCollectionId, getTimelineId } from "../../selectors";

const mapDispatchToProps = {
  onSubmit: createEvent,
  onChangeLocation: push,
};

export default _.compose(
  Timelines.load({ id: getTimelineId }),
  Collections.load({ id: getCollectionId }),
  connect(null, mapDispatchToProps),
)(NewEventModal);
