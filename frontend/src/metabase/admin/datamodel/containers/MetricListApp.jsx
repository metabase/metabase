import React from "react";
import { t } from "ttag";

import Metrics from "metabase/entities/metrics";
import MetricItem from "metabase/admin/datamodel/components/database/MetricItem";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";

@Metrics.loadList({
  wrapped: true,
})
class MetricListApp extends React.Component {
  render() {
    const { metrics } = this.props;
    return (
      <div className="px3">
        <div className="flex py2">
          <Link to="/admin/datamodel/segment/create" className="ml-auto">
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
                onRetire={() =>
                  Metrics.actions.setArchived({ id: metric.id }, true)
                }
                metric={metric}
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

export default MetricListApp;
