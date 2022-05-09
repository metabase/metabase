import React from "react";
import { connect } from "react-redux";

import Collections from "metabase/entities/collections";

import { Collection } from "metabase-types/api";
import { State } from "metabase-types/store";

interface CollectionEditFormOwnProps {
  collection: Collection;
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
  onSave,
  onClose,
}: CollectionEditProps) {
  return (
    <Collections.ModalForm
      form={form}
      collection={collection}
      onSaved={onSave}
      onClose={onClose}
    />
  );
}

export default connect(mapStateToProps)(CollectionEditForm);
