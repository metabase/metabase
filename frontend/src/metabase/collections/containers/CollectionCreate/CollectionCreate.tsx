import React, { useCallback, useEffect, useState } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { goBack } from "react-router-redux";
import _ from "underscore";

import { Collection, CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";

import Collections from "metabase/entities/collections";

import CollectionCreateForm from "./CollectionCreateForm";

interface CollectionCreateOwnProps {
  goBack?: () => void;
  onClose?: () => void;
  onSaved?: (collection: Collection) => void;
}

interface CollectionCreateStateProps {
  initialCollectionId: CollectionId;
}

interface CollectionCreateProps
  extends CollectionCreateOwnProps,
    CollectionCreateStateProps {}

function mapStateToProps(state: State, props: CollectionCreateOwnProps) {
  return {
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
  initialCollectionId,
  goBack,
  onClose,
  onSaved,
}: CollectionCreateProps) {
  const [parentCollectionId, setParentCollectionId] = useState<CollectionId>(
    initialCollectionId,
  );
  const [hasSetParentCollection, setHasSetParentCollection] = useState(false);

  useEffect(() => {
    if (!hasSetParentCollection) {
      setParentCollectionId(initialCollectionId);
    }
  }, [initialCollectionId, hasSetParentCollection]);

  const onChangeField = useCallback((fieldName: string, value: unknown) => {
    if (fieldName === "collection_id") {
      setParentCollectionId(value as CollectionId);
      setHasSetParentCollection(true);
    }
  }, []);

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
    <CollectionCreateForm
      parentCollectionId={parentCollectionId}
      onChangeField={onChangeField}
      onSaved={handleSave}
      onClose={handleClose}
    />
  );
}

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionCreate);
