import { connect } from "react-redux";
import Collections from "metabase/entities/collections";
import { uploadCSV } from "metabase/redux/uploads";
import { Collection } from "metabase-types/api";
import CollectionHeader from "../../components/CollectionHeader";

const mapDispatchToProps = {
  onUpdateCollection: (collection: Collection, values: Partial<Collection>) =>
    Collections.actions.update(collection, values),

  onUploadCSV: uploadCSV,
};

export default connect(null, mapDispatchToProps)(CollectionHeader);
