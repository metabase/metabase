import React from "react";
import { Box } from "grid-styled";
import { t } from "c-3po";

import Select, { Option } from "metabase/components/Select";

import CollectionListLoader from "metabase/containers/CollectionListLoader";

export default class PulseEditCollection extends React.Component {
  render() {
    return (
      <Box>
        <h2>{t`Which collection should this pulse live in?`}</h2>

        <CollectionListLoader>
          {({ collections }) => {
            return (
              <Box my={2} width={400}>
                <Select
                  placeholder="Select a collection"
                  value={
                    this.props.pulse.collection_id ||
                    parseInt(this.props.initialCollectionId)
                  }
                  onChange={({ target }) =>
                    this.props.setPulse({
                      ...this.props.pulse,
                      collection_id: target.value,
                    })
                  }
                >
                  {collections
                    .concat({ name: "None", id: null })
                    .map(collection => (
                      <Option
                        key={collection.id}
                        value={collection.id}
                        iconColor={collection.color}
                        icon={collection.id !== null ? "collection" : null}
                      >
                        {collection.name}
                      </Option>
                    ))}
                </Select>
              </Box>
            );
          }}
        </CollectionListLoader>
      </Box>
    );
  }
}
