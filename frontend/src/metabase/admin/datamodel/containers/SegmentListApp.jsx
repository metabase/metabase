import React from "react";
import { t } from "ttag";

import Segment from "metabase/entities/segments";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";

import SegmentItem from "metabase/admin/datamodel/components/database/SegmentItem";

@Segment.loadList({
  wrapped: true,
  reload: true,
})
class SegmentListApp extends React.Component {
  render() {
    const { segments } = this.props;

    return (
      <div className="px3">
        <div className="flex py2">
          <Link to="/admin/datamodel/segment/create" className="ml-auto">
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
                onRetire={() =>
                  Segment.actions.setArchived({ id: segment.id }, true)
                }
                segment={segment}
                // TODO - ideally we shouldn't need this
                tableMetadata={{}}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}

export default SegmentListApp;
