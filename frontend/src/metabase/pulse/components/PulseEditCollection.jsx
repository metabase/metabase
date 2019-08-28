import React from "react";
import { Box } from "grid-styled";
import { t } from "ttag";

import CollectionSelect from "metabase/containers/CollectionSelect";

export default class PulseEditCollection extends React.Component {
  render() {
    const { pulse, setPulse } = this.props;
    return (
      <Box>
        <h2>{t`Which collection should this pulse live in?`}</h2>

        <Box my={2} width={400}>
          <CollectionSelect
            value={pulse.collection_id}
            onChange={collection_id =>
              setPulse({
                ...pulse,
                collection_id,
              })
            }
          />
        </Box>
      </Box>
    );
  }
}
