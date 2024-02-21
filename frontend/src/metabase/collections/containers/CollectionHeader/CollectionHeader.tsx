import { connect } from "react-redux";

import Collections from "metabase/entities/collections";
import { uploadFile } from "metabase/redux/uploads";
import type { Collection } from "metabase-types/api";

import CollectionHeader from "../../components/CollectionHeader";

const mapDispatchToProps = {
  onUpdateCollection: (collection: Collection, values: Partial<Collection>) =>
    Collections.actions.update(collection, values),

  onUpload: uploadFile,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(CollectionHeader);
