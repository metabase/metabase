import { connect } from "react-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import TimelineListModal from "../../components/TimelineListModal";
import { ModalProps } from "../../types";

const collectionProps = {
  id: (props: ModalProps) => Urls.extractCollectionId(props.params.slug),
};

const mapStateToProps = () => ({
  timelines: [],
});

export default _.compose(
  Collections.load(collectionProps),
  connect(mapStateToProps),
)(TimelineListModal);
