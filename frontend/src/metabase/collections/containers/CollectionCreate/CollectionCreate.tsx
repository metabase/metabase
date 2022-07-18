import React, { useCallback, useEffect, useState } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { goBack } from "react-router-redux";
import _ from "underscore";

import { Collection as BaseCollection, CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";

import Collections from "metabase/entities/collections";

import CollectionCreateForm from "./CollectionCreateForm";

type Collection = BaseCollection & {
  parent_id: CollectionId;
};

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
  const [parentCollectionId, setParentCollectionId] =
    useState<CollectionId>(initialCollectionId);
  const [hasSetParentCollection, setHasSetParentCollection] = useState(false);

  useEffect(() => {
    if (!hasSetParentCollection) {
      setParentCollectionId(initialCollectionId);
    }
  }, [initialCollectionId, hasSetParentCollection]);

  const onChangeValues = useCallback(
    (collection: Collection) => {
      if (collection.parent_id !== parentCollectionId) {
        setParentCollectionId(collection.parent_id);
        setHasSetParentCollection(true);
      }
    },
    [parentCollectionId],
  );

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
      onChange={onChangeValues}
      onSaved={handleSave}
      onClose={handleClose}
    />
  );
}

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionCreate);
