import React, { useCallback, useEffect, useState } from "react";
import { connect } from "react-redux";
import { goBack, push, LocationAction } from "react-router-redux";
import _ from "underscore";

import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";

import { Collection as BaseCollection, CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";

import CollectionEditForm from "./CollectionEditForm";

type Collection = BaseCollection & {
  parent_id: CollectionId;
};

interface CollectionEditOwnProps {
  params: {
    slug: string;
  };
}

interface CollectionEditLoaderProps {
  collection: Collection;
}

interface CollectionEditDispatchProps {
  push: LocationAction;
  goBack: () => void;
}

interface CollectionEditProps
  extends CollectionEditOwnProps,
    CollectionEditLoaderProps,
    CollectionEditDispatchProps {}

const mapDispatchToProps = {
  push,
  goBack,
};

function CollectionEdit({ collection, push, goBack }: CollectionEditProps) {
  const [parentCollectionId, setParentCollectionId] = useState<CollectionId>(
    collection?.parent_id,
  );
  const [hasSetParentCollection, setHasSetParentCollection] = useState(false);

  useEffect(() => {
    if (collection && !hasSetParentCollection) {
      setParentCollectionId(collection.parent_id);
    }
  }, [collection, hasSetParentCollection]);

  const onChangeValues = useCallback(
    (collection: Collection) => {
      if (collection.parent_id !== parentCollectionId) {
        setParentCollectionId(collection.parent_id);
        setHasSetParentCollection(true);
      }
    },
    [parentCollectionId],
  );

  const onSave = useCallback(
    collection => {
      push(Urls.collection(collection));
    },
    [push],
  );

  return (
    <CollectionEditForm
      collection={collection}
      parentCollectionId={parentCollectionId}
      onChange={onChangeValues}
      onSave={onSave}
      onClose={goBack}
    />
  );
}

export default _.compose(
  connect<unknown, CollectionEditDispatchProps, CollectionEditOwnProps, State>(
    null,
    mapDispatchToProps,
  ),
  Collections.load({
    id: (state: State, props: CollectionEditOwnProps) =>
      Urls.extractCollectionId(props.params.slug),
  }),
)(CollectionEdit);
