import React from "react";
import { t } from "ttag";

import Segment from "metabase/entities/segments";
import SegmentItem from "metabase/admin/datamodel/components/SegmentItem";
import FilteredToUrlTable from "metabase/admin/datamodel/hoc/FilteredToUrlTable";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";

@Segment.loadList({ wrapped: true })
@FilteredToUrlTable("segments")
class SegmentListApp extends React.Component {
  render() {
    const { segments, tableSelector } = this.props;

    return (
      <div className="px3">
        <div className="flex py2">
          {tableSelector}
          <Link to={`/admin/datamodel/segment/create`} className="ml-auto">
            <Button primary>{t`New segment`}</Button>
          </Link>
        </div>
        <table className="AdminTable">
          <thead className="text-bold">
            <tr>
              <th style={{ minWidth: "200px" }}>{t`Name`}</th>
              <th className="full">{t`Definition`}</th>
              <th>{t`Actions`}</th>
            </tr>
          </thead>
          <tbody>
            {segments.map(segment => (
              <SegmentItem
                key={segment.id}
                onRetire={() => segment.setArchived(true)}
                segment={segment}
              />
            ))}
          </tbody>
        </table>
        {segments.length === 0 && (
          <div className="flex layout-centered m4 text-medium">
            {t`Create segments to add them to the Filter dropdown in the query builder`}
          </div>
        )}
      </div>
    );
  }
}

export default SegmentListApp;
