/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";

import CollectionSelect from "metabase/containers/CollectionSelect";
import { CollectionSelectContainer } from "./PulseEditCollection.styled";

export default class PulseEditCollection extends Component {
  render() {
    const { pulse, setPulse } = this.props;
    return (
      <div>
        <h2>{t`Which collection should this pulse live in?`}</h2>

        <CollectionSelectContainer>
          <CollectionSelect
            value={pulse.collection_id}
            onChange={collection_id =>
              setPulse({
                ...pulse,
                collection_id,
              })
            }
          />
        </CollectionSelectContainer>
      </div>
    );
  }
}
