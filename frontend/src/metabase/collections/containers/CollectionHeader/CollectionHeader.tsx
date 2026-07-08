import { collectionApi } from "metabase/api";
import { connect } from "metabase/redux";
import { uploadFile } from "metabase/redux/uploads";
import type { Collection } from "metabase-types/api";

import CollectionHeader from "../../components/CollectionHeader";

const mapDispatchToProps = {
  onUpdateCollection: (collection: Collection, values: Partial<Collection>) =>
    collectionApi.endpoints.updateCollection.initiate({
      id: collection.id,
      ...values,
    } as any),

  onUpload: uploadFile,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(CollectionHeader);
