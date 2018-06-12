import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import CollectionListLoader from "metabase/containers/CollectionListLoader";
import { SelectButton } from "metabase/components/Select";

import CollectionPicker from "./CollectionPicker";
import { ROOT_COLLECTION } from "metabase/entities/collections";

export default class CollectionSelect extends React.Component {
  static propTypes = {
    field: PropTypes.object.isRequired,
    // optional collectionId to filter out so you can't move a collection into itself
    collectionId: PropTypes.number,
  };

  render() {
    const { value, onChange, collectionId } = this.props;
    return (
      <CollectionListLoader>
        {({ collections }) => (
          <PopoverWithTrigger
            triggerElement={
              <SelectButton hasValue={value !== undefined}>
                {(_.findWhere(collections, { id: value }) || {}).name ||
                  ROOT_COLLECTION.name}
              </SelectButton>
            }
            sizeToFit
            pinInitialAttachment
          >
            {({ onClose }) => (
              <CollectionPicker
                style={{ minWidth: 300 }}
                className="p2 overflow-auto"
                value={value}
                onChange={value => {
                  onChange(value);
                  onClose();
                }}
                collections={
                  // don't want to allow moving a collection into itself, so filter it out
                  collectionId != null
                    ? collections.filter(c => c.id != collectionId)
                    : collections
                }
              />
            )}
          </PopoverWithTrigger>
        )}
      </CollectionListLoader>
    );
  }
}
