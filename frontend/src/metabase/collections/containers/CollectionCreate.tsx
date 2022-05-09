import React, { useCallback } from "react";
import { connect } from "react-redux";
import { getValues } from "redux-form";
import { withRouter } from "react-router";
import { goBack } from "react-router-redux";
import _ from "underscore";

import { Collection } from "metabase-types/api";
import { State } from "metabase-types/store";

import Collections from "metabase/entities/collections";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";

const { REGULAR_COLLECTION } = PLUGIN_COLLECTIONS;

const FORM_NAME = "create-collection";

interface CollectionCreateOwnProps {
  goBack?: () => void;
  onClose?: () => void;
  onSaved?: (collection: Collection) => void;
}

interface CollectionCreateStateProps {
  form: unknown;
  initialCollectionId?: number | null;
}

interface CollectionCreateProps
  extends CollectionCreateOwnProps,
    CollectionCreateStateProps {}

function mapStateToProps(state: State, props: CollectionCreateOwnProps) {
  const formValues = getValues(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    state.form[FORM_NAME],
  );
  return {
    form: Collections.selectors.getForm(state, { ...props, formValues }),
    initialCollectionId: Collections.selectors.getInitialCollectionId(
      state,
      props,
    ),
  };
}

const mapDispatchToProps = {
  goBack,
};

function CollectionCreate({
  form,
  initialCollectionId,
  goBack,
  onClose,
  onSaved,
}: CollectionCreateProps) {
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      goBack?.();
    }
  }, [goBack, onClose]);

  const handleSave = useCallback(
    (collection: Collection) => {
      if (onSaved) {
        onSaved(collection);
      } else {
        goBack?.();
      }
    },
    [goBack, onSaved],
  );

  return (
    <Collections.ModalForm
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
