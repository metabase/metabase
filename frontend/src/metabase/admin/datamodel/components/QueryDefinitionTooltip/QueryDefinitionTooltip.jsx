import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import { FieldSet } from "metabase/components/FieldSet";
import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";

import { QueryDefinition } from "../QueryDefinition";

/**
 * @deprecated use MLv2
 */
export class QueryDefinitionTooltip extends Component {
  static propTypes = {
    type: PropTypes.string,
    object: PropTypes.object.isRequired,
  };

  render() {
    const { type, object } = this.props;
    return (
      <div className={CS.p2} style={{ width: 250 }}>
        <div>
          {type && type === "metric" && object.archived
            ? t`This metric has been retired.  It's no longer available for use.`
            : object.description}
        </div>
        {object.definition && (
          <div className={CS.mt2}>
            <FieldSet legend={t`Definition`} className={CS.borderLight}>
              <QueryDefinition
                className={QueryBuilderS.TooltipFilterList}
                object={object}
              />
            </FieldSet>
          </div>
        )}
      </div>
    );
  }
}
