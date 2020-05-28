import React, { Component } from "react";
import PropTypes from "prop-types";

import FilterList from "./FilterList";
import AggregationName from "./AggregationName";
import FieldSet from "metabase/components/FieldSet";

import * as Q_DEPRECATED from "metabase/lib/query";
import { t } from "ttag";

export default class QueryDefinitionTooltip extends Component {
  static propTypes = {
    type: PropTypes.string,
    object: PropTypes.object.isRequired,
    tableMetadata: PropTypes.object.isRequired,
  };

  render() {
    const { type, object, tableMetadata, customFields } = this.props;

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
              <div className="TooltipFilterList">
                {Q_DEPRECATED.getAggregations(object.definition).map(
                  aggregation => (
                    <AggregationName
                      aggregation={aggregation}
                      tableMetadata={tableMetadata}
                      customFields={customFields}
                    />
                  ),
                )}
                <FilterList
                  filters={Q_DEPRECATED.getFilters(object.definition)}
                  maxDisplayValues={Infinity}
                />
              </div>
            </FieldSet>
          </div>
        )}
      </div>
    );
  }
}
