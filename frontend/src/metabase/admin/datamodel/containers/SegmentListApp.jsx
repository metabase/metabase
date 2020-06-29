import React from "react";
import { t } from "ttag";

import Segment from "metabase/entities/segments";
import SegmentItem from "metabase/admin/datamodel/components/database/SegmentItem";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

import FilteredToUrlTable from "../hoc/FilteredToUrlTable";

@Segment.loadList({ wrapped: true })
@FilteredToUrlTable("segments")
class SegmentListApp extends React.Component {
  render() {
    const { segments, tableId, setTableId } = this.props;

    return (
      <div className="px3">
        <div className="flex py2">
          <DatabaseSchemaAndTableDataSelector
            selectedTableId={tableId}
            setSourceTableFn={setTableId}
          />
          <Link
            to={`/admin/datamodel/segment/create?table=${tableId}`}
            className="ml-auto"
          >
            <Button primary disabled={tableId == null}>{t`New segment`}</Button>
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
