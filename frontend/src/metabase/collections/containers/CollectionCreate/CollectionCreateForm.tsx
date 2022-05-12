import React from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";

import { Collection as BaseCollection, CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";

import Collections from "metabase/entities/collections";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";

const { REGULAR_COLLECTION } = PLUGIN_COLLECTIONS;

type Collection = BaseCollection & {
  parent_id: CollectionId;
};

interface CollectionCreateFormOwnProps {
  parentCollectionId: CollectionId;
  onChange: (collection: Collection) => void;
  onSaved?: (collection: Collection) => void;
  onClose?: () => void;
}

interface CollectionCreateFormStateProps {
  form: unknown;
}

interface CollectionCreateFormProps
  extends CollectionCreateFormOwnProps,
    CollectionCreateFormStateProps {}

function mapStateToProps(state: State, props: CollectionCreateFormOwnProps) {
  return {
    form: Collections.selectors.getForm(state, props),
  };
}

function CollectionCreateForm({
  form,
  parentCollectionId,
  onChange,
  onSaved,
  onClose,
}: CollectionCreateFormProps) {
  return (
    <Collections.ModalForm
      form={form}
      collection={{
        parent_id: parentCollectionId,
        authority_level: REGULAR_COLLECTION.type,
      }}
      overwriteOnInitialValuesChange
      onChange={onChange}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}

export default _.compose(
  withRouter,
  connect(mapStateToProps),
)(CollectionCreateForm);
