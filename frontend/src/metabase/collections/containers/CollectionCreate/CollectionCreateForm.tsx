import React from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";

import { Collection, CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";

import Collections from "metabase/entities/collections";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";

const { REGULAR_COLLECTION } = PLUGIN_COLLECTIONS;

interface CollectionCreateFormOwnProps {
  parentCollectionId: CollectionId;
  onChangeField: (fieldName: string, value: unknown) => void;
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
  onChangeField,
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
      onChangeField={onChangeField}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}

export default _.compose(
  withRouter,
  connect(mapStateToProps),
)(CollectionCreateForm);
