import React from "react";
import { Flex } from "grid-styled";
import { Link } from "react-router";
import { t } from "c-3po";

import Icon from "metabase/components/Icon";

const COLLECTION_ICON_SIZE = 18;

const CollectionButtons = ({ collections, isAdmin, push }) => (
  <ol>
    {collections
      .map(collection => (
        <CollectionLink {...collection} push={push} isAdmin={isAdmin} />
      ))
      .concat(isAdmin ? [<NewCollectionButton push={push} />] : [])
      .map((element, index) => <li key={index}>{element}</li>)}
  </ol>
);

const CollectionLink = ({ name, slug }) => {
  return (
    <Link to={`/questions/collections/${slug}`}>
      <Flex align="center">
        <Icon name="collection" size={COLLECTION_ICON_SIZE} />
        <h3>{name}</h3>
      </Flex>
    </Link>
  );
};

const NewCollectionButton = ({ push }) => (
  <div onClick={() => push(`/collections/create`)}>
    <div>
      <div
        className="flex align-center justify-center ml-auto mr-auto mb2 mt2"
        style={{
          border: "2px solid #D8E8F5",
          borderRadius: COLLECTION_ICON_SIZE,
          height: COLLECTION_ICON_SIZE,
          width: COLLECTION_ICON_SIZE,
        }}
      >
        <Icon name="add" width="32" height="32" />
      </div>
    </div>
    <h3>{t`New collection`}</h3>
  </div>
);

export default CollectionButtons;
