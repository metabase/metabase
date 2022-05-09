import React from "react";
import { connect } from "react-redux";

import Collections from "metabase/entities/collections";

import { Collection as BaseCollection, CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";

type Collection = BaseCollection & {
  parent_id: CollectionId;
};

interface CollectionEditFormOwnProps {
  collection: Collection;
  parentCollectionId: CollectionId;
  onChange: (collection: Collection) => void;
  onSave: (collection: Collection) => void;
  onClose: () => void;
}

interface CollectionEditFormStateProps {
  form: unknown;
}

interface CollectionEditProps
  extends CollectionEditFormOwnProps,
    CollectionEditFormStateProps {}

function mapStateToProps(state: State, props: CollectionEditFormOwnProps) {
  return {
    form: Collections.selectors.getForm(state, props),
  };
}

function CollectionEditForm({
  form,
  collection,
  onChange,
  onSave,
  onClose,
}: CollectionEditProps) {
  return (
    <Collections.ModalForm
      form={form}
      collection={collection}
      overwriteOnInitialValuesChange
      onChange={onChange}
      onSaved={onSave}
      onClose={onClose}
    />
  );
}

export default connect(mapStateToProps)(CollectionEditForm);
