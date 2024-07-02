/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import SegmentItem from "metabase/admin/datamodel/components/SegmentItem";
import FilteredToUrlTable from "metabase/admin/datamodel/hoc/FilteredToUrlTable";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import Segments from "metabase/entities/segments";

class SegmentListAppInner extends Component {
  render() {
    const { segments, tableSelector, setArchived } = this.props;

    return (
      <div className={cx(CS.px3, CS.pb2)}>
        <div className={cx(CS.flex, CS.py2)}>
          {tableSelector}
          <Link to="/admin/datamodel/segment/create" className={CS.mlAuto}>
            <Button primary>{t`New segment`}</Button>
          </Link>
        </div>
        <table className={AdminS.AdminTable}>
          <thead className={CS.textBold}>
            <tr>
              <th style={{ minWidth: "320px" }}>{t`Name`}</th>
              <th className={CS.full}>{t`Definition`}</th>
              <th>{t`Actions`}</th>
            </tr>
          </thead>
          <tbody>
            {segments.map(segment => (
              <SegmentItem
                key={segment.id}
                onRetire={() => setArchived(segment, true)}
                segment={segment}
              />
            ))}
          </tbody>
        </table>
        {segments.length === 0 && (
          <div className={cx(CS.flex, CS.layoutCentered, CS.m4, CS.textMedium)}>
            {t`Create segments to add them to the Filter dropdown in the query builder`}
          </div>
        )}
      </div>
    );
  }
}

const SegmentListApp = _.compose(
  Segments.loadList(),
  FilteredToUrlTable("segments"),
  connect(null, { setArchived: Segments.actions.setArchived }),
)(SegmentListAppInner);

export default SegmentListApp;
