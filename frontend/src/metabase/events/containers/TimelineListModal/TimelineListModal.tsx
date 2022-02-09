import { connect } from "react-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import { State } from "metabase-types/store";
import TimelineListModal from "../../components/TimelineListModal";

interface TimelineListModalParams {
  slug: string;
}

interface TimelineListModalProps {
  params: TimelineListModalParams;
}

const collectionProps = {
  id: (state: State, props: TimelineListModalProps) => {
    return Urls.extractCollectionId(props.params.slug);
  },
};

const mapStateToProps = () => ({
  timelines: [],
});

export default _.compose(
  Collections.load(collectionProps),
  connect(mapStateToProps),
)(TimelineListModal);
