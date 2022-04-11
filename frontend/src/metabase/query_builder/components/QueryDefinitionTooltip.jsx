import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import FieldSet from "metabase/components/FieldSet";
import QueryDefinition from "./QueryDefinition";

export default class QueryDefinitionTooltip extends React.Component {
  static propTypes = {
    type: PropTypes.string,
    object: PropTypes.object.isRequired,
  };

  render() {
    const { type, object } = this.props;
    return (
      <div className="p2" style={{ width: 250 }}>
        <div>
          {type && type === "metric" && object.archived
            ? t`This metric has been retired.  It's no longer available for use.`
            : object.description}
        </div>
        {object.definition && (
          <div className="mt2">
            <FieldSet legend={t`Definition`} className="border-light">
              <QueryDefinition className="TooltipFilterList" object={object} />
            </FieldSet>
          </div>
        )}
      </div>
    );
  }
}
