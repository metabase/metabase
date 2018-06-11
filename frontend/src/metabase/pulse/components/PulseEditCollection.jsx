import React from "react";
import { Box } from "grid-styled";
import { t } from "c-3po";

import CollectionSelect from "metabase/containers/CollectionSelect";

export default class PulseEditCollection extends React.Component {
  render() {
    return (
      <Box>
        <h2>{t`Which collection should this pulse live in?`}</h2>

        <Box my={2} width={400}>
          <CollectionSelect
            value={
              this.props.pulse.collection_id ||
              parseInt(this.props.initialCollectionId)
            }
            onChange={collection_id =>
              this.props.setPulse({
                ...this.props.pulse,
                collection_id,
              })
            }
          />
        </Box>
      </Box>
    );
  }
}
