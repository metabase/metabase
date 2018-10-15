import React from "react";
import { t } from "c-3po";
import { Box } from "grid-styled";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

import AdminHeader from "metabase/components/AdminHeader";
import Link from "metabase/components/Link";

@entityListLoader({
  entityType: "tasks",
})
class TasksApp extends React.Component {
  render() {
    const { list } = this.props;
    return (
      <Box p={3}>
        <AdminHeader title={t`Tasks log`} />
        <table className="ContentTable mt2">
          <thead>
            <th>{t`Task`}</th>
            <th>{t`DB ID`}</th>
            <th>{t`Started at`}</th>
            <th>{t`Ended at`}</th>
            <th>{t`Duration (ms)`}</th>
            <th>{t`Details`}</th>
          </thead>
          <tbody>
            {list.map(l => (
              <tr key={l.id}>
                <td>{l.task}</td>
                <td>{l.dbId}</td>
                <td>{l.started_at}</td>
                <td>{l.ended_at}</td>
                <td>{l.duration}</td>
                <td>
                  <Link
                    className="link"
                    to={`/admin/task/${l.id}`}
                  >{t`View`}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    );
  }
}

export default TasksApp;
