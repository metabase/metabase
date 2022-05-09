import React, { useCallback } from "react";
import { connect } from "react-redux";
import { goBack, push, LocationAction } from "react-router-redux";

import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";

import { Collection } from "metabase-types/api";
import { State } from "metabase-types/store";

import CollectionEditForm from "./CollectionEditForm";

interface CollectionEditOwnProps {
  params: {
    slug: string;
  };
}

interface CollectionEditDispatchProps {
  push: LocationAction;
  goBack: () => void;
}

interface CollectionEditProps
  extends CollectionEditOwnProps,
    CollectionEditDispatchProps {}

const mapDispatchToProps = {
  push,
  goBack,
};

function CollectionEdit({ params, push, goBack }: CollectionEditProps) {
  const collectionId = Urls.extractCollectionId(params.slug);

  const onSave = useCallback(
    collection => {
      push(Urls.collection(collection));
    },
    [push],
  );

  return (
    <Collections.Loader id={collectionId}>
      {({ collection }: { collection: Collection }) => (
        <CollectionEditForm
          collection={collection}
          onSave={onSave}
          onClose={goBack}
        />
      )}
    </Collections.Loader>
  );
}

export default connect<
  unknown,
  CollectionEditDispatchProps,
  CollectionEditOwnProps,
  State
>(
  null,
  mapDispatchToProps,
)(CollectionEdit);
