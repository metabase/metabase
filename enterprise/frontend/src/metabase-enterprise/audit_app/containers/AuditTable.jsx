/* @flow */

import React from "react";

import "./AuditTableVisualization";

import QuestionLoadAndDisplay from "./QuestionLoadAndDisplay";
import Icon from "metabase/components/Icon";

import Question from "metabase-lib/lib/Question";

import { connect } from "react-redux";
import { push } from "react-router-redux";
import { getMetadata } from "metabase/selectors/metadata";

import { AuditMode } from "../lib/util";

import { chain } from "icepick";
import cx from "classnames";
import { t } from "ttag";

import type { AuditDashCard } from "../types";

type Props = {
  table: AuditDashCard,
  pageSize: number,
};
type State = {
  page: number,
  hasMorePages: boolean,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
};

const DEFAULT_PAGE_SIZE = 100;

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class AuditTable extends React.Component {
  props: Props;
  state: State = {
    page: 0,
    hasMorePages: false,
  };

  static defaultProps = {
    pageSize: DEFAULT_PAGE_SIZE,
  };

  render() {
    // $FlowFixMe: metadata, and onChangeLocation provided by @connect
    const { metadata, table, onChangeLocation, pageSize } = this.props;
    const { page, hasMorePages } = this.state;

    const card = chain(table.card)
      .assoc("display", "audit-table")
      .assocIn(["dataset_query", "limit"], pageSize)
      .assocIn(["dataset_query", "offset"], pageSize * page)
      .value();

    const question = new Question(card, metadata);

    return (
      <div>
        <QuestionLoadAndDisplay
          className="mt3"
          question={question}
          metadata={metadata}
          mode={AuditMode}
          onChangeLocation={onChangeLocation}
          onChangeCardAndRun={() => {}}
          onLoad={results =>
            this.setState({ hasMorePages: results[0].row_count === pageSize })
          }
        />
        {(hasMorePages || page > 0) && (
          <div className="mt1 pt2 border-top flex">
            <PaginationControls
              className="ml-auto"
              start={page * pageSize}
              end={(page + 1) * pageSize - 1}
              hasPrevious={page > 0}
              hasNext={hasMorePages}
              onPrevious={() => this.setState({ page: page - 1 })}
              onNext={() => this.setState({ page: page + 1 })}
            />
          </div>
        )}
      </div>
    );
  }
}

const PaginationControls = ({
  className,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  start,
  end,
  total,
}) => (
  <span className={cx(className, "p1 flex flex-no-shrink flex-align-right")}>
    {start != null && end != null ? (
      <span className="text-bold">
        {total
          ? t`Rows ${start + 1}-${end + 1} of ${total}`
          : t`Rows ${start + 1}-${end + 1}`}
      </span>
    ) : null}
    <span
      className={cx("text-brand-hover px1 cursor-pointer", {
        disabled: !hasPrevious,
      })}
      onClick={onPrevious}
    >
      <Icon name="left" size={10} />
    </span>
    <span
      className={cx("text-brand-hover pr1 cursor-pointer", {
        disabled: !hasNext,
      })}
      onClick={onNext}
    >
      <Icon name="right" size={10} />
    </span>
  </span>
);
