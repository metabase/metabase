/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";
import DatePicker from "metabase/query_builder/components/filters/pickers/LegacyDatePicker/DatePicker";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import SelectButton from "metabase/core/components/SelectButton";
import Button from "metabase/core/components/Button";

import * as Card from "metabase-lib/queries/utils/card";
import { generateTimeFilterValuesDescriptions } from "metabase-lib/queries/utils/query-time";
import * as Query from "metabase-lib/queries/utils/query";
import * as Filter from "metabase-lib/queries/utils/filter";

import { FieldDimension } from "metabase-lib/Dimension";

export default class TimeseriesFilterWidget extends Component {
  state = {
    dimension: null,
    filter: null,
    filterIndex: -1,
    currentFilter: null,
  };

  UNSAFE_componentWillMount() {
    this.UNSAFE_componentWillReceiveProps(this.props);
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    const { question, query } = nextProps;
    const breakouts = question.isStructured() && query.breakouts();
    if (breakouts && breakouts.length > 0) {
      const filters = query.filters();

      const dimensions = breakouts.map(b => b.dimension());
      const firstDimension = dimensions[0];

      const dimension =
        firstDimension instanceof FieldDimension
          ? firstDimension.withoutTemporalBucketing()
          : firstDimension;

      const filterIndex = _.findIndex(
        filters,
        filter =>
          Filter.isFieldFilter(filter) &&
          _.isEqual(filter[1], dimension.mbql()),
      );

      let filter, currentFilter;
      if (filterIndex >= 0) {
        filter = currentFilter = filters[filterIndex];
      } else {
        filter = null; // All time
      }

      this.setState({ dimension, filter, filterIndex, currentFilter });
    }
  }

  render() {
    const { className, card, setDatasetQuery } = this.props;
    const { dimension, filter, filterIndex, currentFilter } = this.state;
    let currentDescription;

    if (currentFilter) {
      currentDescription =
        generateTimeFilterValuesDescriptions(currentFilter).join(" - ");
      if (currentFilter[0] === ">") {
        currentDescription = t`After ${currentDescription}`;
      } else if (currentFilter[0] === "<") {
        currentDescription = t`Before ${currentDescription}`;
      } else if (currentFilter[0] === "is-null") {
        currentDescription = t`Is Empty`;
      } else if (currentFilter[0] === "not-null") {
        currentDescription = t`Not Empty`;
      }
    } else {
      currentDescription = t`All Time`;
    }

    return (
      <PopoverWithTrigger
        triggerElement={
          <SelectButton hasValue>{currentDescription}</SelectButton>
        }
        triggerClasses={cx(className, "my2")}
        ref={ref => (this._popover = ref)}
        sizeToFit
        // accomodate dual calendar size
        autoWidth={true}
      >
        <DatePicker
          className="m2"
          dimension={dimension}
          filter={filter}
          onFilterChange={newFilter => {
            this.setState({ filter: newFilter });
          }}
          includeAllTime
        />
        <div className="p1">
          <Button
            purple
            className="full"
            onClick={() => {
              let query = Card.getQuery(card);
              if (query) {
                if (filterIndex >= 0) {
                  query = Query.updateFilter(query, filterIndex, filter);
                } else {
                  query = Query.addFilter(query, filter);
                }
                const datasetQuery = {
                  ...card.dataset_query,
                  query,
                };
                setDatasetQuery(datasetQuery, { run: true });
              }
              if (this._popover) {
                this._popover.close();
              }
            }}
          >
            {t`Apply`}
          </Button>
        </div>
      </PopoverWithTrigger>
    );
  }
}
