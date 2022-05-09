/* eslint-disable react/prop-types */
import React, { useCallback } from "react";
import { connect } from "react-redux";
import { getValues } from "redux-form";
import { withRouter } from "react-router";
import { goBack } from "react-router-redux";
import _ from "underscore";

import Collection from "metabase/entities/collections";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";

const { REGULAR_COLLECTION } = PLUGIN_COLLECTIONS;

const FORM_NAME = "create-collection";

const mapStateToProps = (state, props) => {
  const formValues = getValues(state.form[FORM_NAME]);
  return {
    form: Collection.selectors.getForm(state, { ...props, formValues }),
    initialCollectionId: Collection.selectors.getInitialCollectionId(
      state,
      props,
    ),
  };
};

const mapDispatchToProps = {
  goBack,
};

function CollectionCreate({
  form,
  initialCollectionId,
  goBack,
  onClose,
  onSaved,
}) {
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      goBack();
    }
  }, [goBack, onClose]);

  const handleSave = useCallback(
    collection => {
      if (onSaved) {
        onSaved(collection);
      } else {
        goBack();
      }
    },
    [goBack, onSaved],
  );

  return (
    <Collection.ModalForm
      overwriteOnInitialValuesChange
      formName={FORM_NAME}
      form={form}
      collection={{
        parent_id: initialCollectionId,
        authority_level: REGULAR_COLLECTION.type,
      }}
      onSaved={handleSave}
      onClose={handleClose}
    />
  );
}

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionCreate);
