import { connect } from "react-redux";
import { Collection } from "metabase-types/api";
import CollectionHeader from "../../components/CollectionHeader";
import Collections from "metabase/entities/collections";

const mapDispatchToProps = {
  onChangeName: (collection: Collection, name: string) =>
    Collections.actions.update(collection, { name }),
  onChangeDescription: (collection: Collection, description: string) =>
    Collections.actions.update(collection, { description }),
};

export default connect(null, mapDispatchToProps)(CollectionHeader);
