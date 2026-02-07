/* eslint-disable react/prop-types */
import cx from "classnames";
import type { ReactNode } from "react";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { SegmentItem } from "metabase/admin/datamodel/components/SegmentItem";
import { FilteredToUrlTable } from "metabase/admin/datamodel/hoc/FilteredToUrlTable";
import { Button } from "metabase/common/components/Button";
import { Link } from "metabase/common/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Segments } from "metabase/entities/segments";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { Segment } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface SegmentListAppInnerProps {
  segments: Segment[];
  tableSelector: ReactNode;
  setArchived: (segment: Segment, archived: boolean) => void;
  isAdmin: boolean;
  isRemoteSyncReadOnly: boolean;
}

class SegmentListAppInner extends Component<SegmentListAppInnerProps> {
  render() {
    const {
      segments,
      tableSelector,
      setArchived,
      isAdmin,
      isRemoteSyncReadOnly,
    } = this.props;

    return (
      <div
        className={cx(CS.px3, CS.pb2, CS.wrapper, CS.scrollY, CS.bgWhite)}
        data-testid="segment-list-app"
      >
        <div className={cx(CS.flex, CS.py2)}>
          {tableSelector}
          {isAdmin && (
            <Link to={Urls.newDataModelSegment()} className={CS.mlAuto}>
              <Button primary>{t`New segment`}</Button>
            </Link>
          )}
        </div>
        <table className={AdminS.AdminTable}>
          <thead className={CS.textBold}>
            <tr>
              <th style={{ minWidth: "320px" }}>{t`Name`}</th>
              <th>{t`Table`}</th>
              <th className={CS.full}>{t`Definition`}</th>
              {isAdmin && <th>{t`Actions`}</th>}
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => (
              <SegmentItem
                key={segment.id}
                onRetire={
                  isAdmin ? () => setArchived(segment, true) : undefined
                }
                segment={segment}
                readOnly={segment.table?.is_published && isRemoteSyncReadOnly}
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

export const SegmentListApp = _.compose(
  Segments.loadList(),
  FilteredToUrlTable("segments"),
  connect(
    (state: State) => ({
      isAdmin: getUserIsAdmin(state),
      isRemoteSyncReadOnly: PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly(state),
    }),
    {
      setArchived: Segments.actions.setArchived,
    },
  ),
)(SegmentListAppInner);
