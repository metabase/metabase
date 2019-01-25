/* @flow weak */

import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import cx from "classnames";
import { t } from "c-3po";
import AddClauseButton from "./AddClauseButton.jsx";
import Expressions from "./expressions/Expressions.jsx";
import ExpressionWidget from "./expressions/ExpressionWidget.jsx";
import LimitWidget from "./LimitWidget.jsx";
import SortWidget from "./SortWidget.jsx";
import Popover from "metabase/components/Popover.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type { DatasetQuery } from "metabase/meta/types/Card";
import type { GuiQueryEditorFeatures } from "./GuiQueryEditor";

type Props = {
  query: StructuredQuery,
  setDatasetQuery: (
    datasetQuery: DatasetQuery,
    options: { run: boolean },
  ) => void,
  features: GuiQueryEditorFeatures,
  onClose?: () => void,
};

type State = {
  editExpression: any,
};

export class ExtendedOptionsPopover extends Component {
  props: Props;
  state: State = {
    editExpression: null,
  };

  static propTypes = {
    features: PropTypes.object.isRequired,
    datasetQuery: PropTypes.object.isRequired,
    tableMetadata: PropTypes.object,
    setDatasetQuery: PropTypes.func.isRequired,
    onClose: PropTypes.func,
  };

  static defaultProps = {
    features: {
      sort: true,
      limit: true,
    },
  };

  setExpression(name, expression, previousName) {
    let { query, setDatasetQuery } = this.props;
    query
      .updateExpression(name, expression, previousName)
      .update(setDatasetQuery);
    this.setState({ editExpression: null });
    MetabaseAnalytics.trackEvent(
      "QueryBuilder",
      "Set Expression",
      !_.isEmpty(previousName),
    );
  }

  removeExpression(name) {
    let { query, setDatasetQuery } = this.props;
    query.removeExpression(name).update(setDatasetQuery);
    this.setState({ editExpression: null });

    MetabaseAnalytics.trackEvent("QueryBuilder", "Remove Expression");
  }

  setLimit = limit => {
    let { query, setDatasetQuery } = this.props;
    query.updateLimit(limit).update(setDatasetQuery);
    MetabaseAnalytics.trackEvent("QueryBuilder", "Set Limit", limit);
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  renderSort() {
    const { query, setDatasetQuery } = this.props;

    let sortList, addSortButton;

    const tableMetadata = query.table();
    if (tableMetadata) {
      const sorts = query.sorts();

      sortList = sorts.map((sort, index) => (
        <SortWidget
          key={index}
          query={query}
          tableMetadata={query.table()}
          sort={sort}
          fieldOptions={query.sortOptions(sort)}
          removeOrderBy={() => query.removeSort(index).update(setDatasetQuery)}
          updateOrderBy={orderBy =>
            query.updateSort(index, orderBy).update(setDatasetQuery)
          }
        />
      ));

      if (query.canAddSort()) {
        addSortButton = (
          <AddClauseButton
            text={t`Pick a field to sort by`}
            onClick={() => {
              // $FlowFixMe: shouldn't be adding a sort with null field
              query.addSort(["asc", null]).update(setDatasetQuery);
            }}
          />
        );
      }
    }

    if ((sortList && sortList.length > 0) || addSortButton) {
      return (
        <div className="pb3">
          <div className="pb1 h6 text-uppercase text-medium text-bold">{t`Sort`}</div>
          {sortList}
          {addSortButton}
        </div>
      );
    }
  }

  renderLimit() {
    const { query } = this.props;
    return (
      <div>
        <div className="mb1 h6 text-uppercase text-medium text-bold">{t`Row limit`}</div>
        <LimitWidget limit={query.limit()} onChange={this.setLimit} />
      </div>
    );
  }

  renderExpressions() {
    const { query } = this.props;
    return (
      <Expressions
        expressions={query.expressions()}
        tableMetadata={query.table()}
        onAddExpression={() => this.setState({ editExpression: true })}
        onEditExpression={name => {
          this.setState({ editExpression: name });
          MetabaseAnalytics.trackEvent(
            "QueryBuilder",
            "Show Edit Custom Field",
          );
        }}
      />
    );
  }

  renderExpressionWidget() {
    // if we aren't editing any expression then there is nothing to do
    if (!this.state.editExpression || !this.props.tableMetadata) {
      return null;
    }

    const { query } = this.props;

    const expressions = query.expressions();
    const expression = expressions && expressions[this.state.editExpression];
    const name = _.isString(this.state.editExpression)
      ? this.state.editExpression
      : "";

    return (
      <ExpressionWidget
        name={name}
        expression={expression}
        tableMetadata={query.table()}
        onSetExpression={(newName, newExpression) =>
          this.setExpression(newName, newExpression, name)
        }
        onRemoveExpression={name => this.removeExpression(name)}
        onCancel={() => this.setState({ editExpression: null })}
      />
    );
  }

  renderPopover() {
    const { features, query } = this.props;

    const sortEnabled = features.sort;
    const expressionsEnabled =
      query.table() && _.contains(query.table().db.features, "expressions");
    const limitEnabled = features.limit;

    return (
      <div className="p3">
        {sortEnabled && this.renderSort()}
        {expressionsEnabled && this.renderExpressions()}
        {limitEnabled && this.renderLimit()}
      </div>
    );
  }

  render() {
    return this.renderExpressionWidget() || this.renderPopover();
  }
}

export default class ExtendedOptions extends React.Component {
  state = {
    isOpen: false,
  };

  static defaultProps = {
    features: {
      sort: true,
      limit: true,
    },
  };

  render() {
    const { features } = this.props;
    if (!features.sort && !features.limit) {
      return null;
    }

    const onClick = this.props.tableMetadata
      ? () => this.setState({ isOpen: true })
      : null;

    return (
      <div className="GuiBuilder-section GuiBuilder-sort-limit flex align-center">
        <span
          className={cx("EllipsisButton no-decoration text-light px1", {
            "cursor-pointer": onClick,
          })}
          onClick={onClick}
        >
          …
        </span>
        <Popover
          isOpen={this.state.isOpen}
          onClose={() => this.setState({ isOpen: false })}
        >
          <ExtendedOptionsPopover {...this.props} />
        </Popover>
      </div>
    );
  }
}
