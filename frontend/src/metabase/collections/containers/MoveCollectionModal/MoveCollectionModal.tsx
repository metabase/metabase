import { connect } from "react-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import { State } from "metabase-types/store";
import MoveCollectionModal from "../../components/MoveCollectionModal";

interface MoveCollectionModalProps {
  params: MoveCollectionModalParams;
}

interface MoveCollectionModalParams {
  slug: string;
}

const collectionProps = {
  id: (state: State, props: MoveCollectionModalProps) =>
    Urls.extractCollectionId(props.params.slug),
};

const mapDispatchToProps = {
  onMove: Collections.actions.setCollection,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Collections.load(collectionProps),
  connect(null, mapDispatchToProps),
)(MoveCollectionModal);
