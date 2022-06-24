import { connect } from "react-redux";
import Collections from "metabase/entities/collections";
import { Collection } from "metabase-types/api";
import CollectionHeader from "../../components/CollectionHeader";

const mapDispatchToProps = {
  onUpdateCollection: (collection: Collection, values: Partial<Collection>) =>
    Collections.actions.update(collection, values),
};

export default connect(null, mapDispatchToProps)(CollectionHeader);
