import { connect } from "react-redux";
import Collections from "metabase/entities/collections";
import { Collection } from "metabase-types/api";
import CollectionHeader from "../../components/CollectionHeader";

const mapDispatchToProps = {
  onChangeName: (collection: Collection, name: string) =>
    Collections.actions.update(collection, { name }),
  onChangeDescription: (collection: Collection, description: string) =>
    Collections.actions.update(collection, { description }),
};

export default connect(null, mapDispatchToProps)(CollectionHeader);
