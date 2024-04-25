import PropTypes from "prop-types";
import { useState } from "react";

import { CreateCollectionOnTheGoButton } from "metabase/containers/CreateCollectionOnTheGo";

import ItemPicker from "./ItemPicker";

const CollectionPicker = ({ value, onChange, ...props }) => {
  const [openCollectionId, setOpenCollectionId] = useState("root");
  return (
    <ItemPicker
      {...props}
      value={
        value === undefined ? undefined : { model: "collection", id: value }
      }
      onChange={collection => onChange(collection ? collection.id : undefined)}
      models={["collection"]}
      onOpenCollectionChange={id => setOpenCollectionId(id)}
    >
      <CreateCollectionOnTheGoButton openCollectionId={openCollectionId} />
    </ItemPicker>
  );
};

CollectionPicker.propTypes = {
  // a collection ID or null (for "root" collection), or undefined if none selected
  value: PropTypes.number,
  // callback that takes a collection ID or null (for "root" collection)
  onChange: PropTypes.func.isRequired,
};

export default CollectionPicker;
