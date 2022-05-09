/* eslint-disable react/prop-types */
import React, { useCallback } from "react";

import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";

import * as Urls from "metabase/lib/urls";
import Collection from "metabase/entities/collections";

import CollectionEditForm from "./CollectionEditForm";

const mapDispatchToProps = {
  push,
  goBack,
};

function CollectionEdit({ params, push, goBack }) {
  const collectionId = Urls.extractCollectionId(params.slug);

  const onSave = useCallback(
    collection => {
      push(Urls.collection(collection));
    },
    [push],
  );

  return (
    <Collection.Loader id={collectionId}>
      {({ collection }) => (
        <CollectionEditForm
          collection={collection}
          onSave={onSave}
          onClose={goBack}
        />
      )}
    </Collection.Loader>
  );
}

export default connect(null, mapDispatchToProps)(CollectionEdit);
