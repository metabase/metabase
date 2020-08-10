import React from "react";
import { t } from "ttag";

import Metrics from "metabase/entities/metrics";
import MetricItem from "metabase/admin/datamodel/components/MetricItem";
import FilteredToUrlTable from "metabase/admin/datamodel/hoc/FilteredToUrlTable";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";

@Metrics.loadList({ wrapped: true })
@FilteredToUrlTable("metrics")
class MetricListApp extends React.Component {
  render() {
    const { metrics, tableSelector } = this.props;

    return (
      <div className="px3">
        <div className="flex py2">
          {tableSelector}
          <Link to={`/admin/datamodel/metric/create`} className="ml-auto">
            <Button primary>{t`New metric`}</Button>
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
            {metrics.map(metric => (
              <MetricItem
                key={metric.id}
                onRetire={() => metric.setArchived(true)}
                metric={metric}
              />
            ))}
          </tbody>
        </table>
        {metrics.length === 0 && (
          <div className="flex layout-centered m4 text-medium">
            {t`Create metrics to add them to the Summarize dropdown in the query builder`}
          </div>
        )}
      </div>
    );
  }
}

export default MetricListApp;
