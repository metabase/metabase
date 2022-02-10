import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import Collections from "metabase/entities/collections";
import NewEventModal from "../../components/NewEventModal";
import { createTimelineWithEvent } from "../../actions";
import { getCollectionId } from "../../selectors";

const mapDispatchToProps = {
  onSubmit: createTimelineWithEvent,
  onChangeLocation: push,
};

export default _.compose(
  Collections.load({ id: getCollectionId }),
  connect(null, mapDispatchToProps),
)(NewEventModal);
