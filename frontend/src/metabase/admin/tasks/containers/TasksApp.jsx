import React from "react";
import { t } from "c-3po";
import { Box } from "grid-styled";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

import AdminHeader from "metabase/components/AdminHeader";
import Link from "metabase/components/Link";

@entityListLoader({
  entityType: "tasks",
  entityQuery: { limit: 40, offset: 0 },
})
class TasksApp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      offset: this.props.entityQuery.offset,
    };
  }
  render() {
    const { tasks, children } = this.props;
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
            {tasks.map(task => (
              <tr key={task.id}>
                <td className="text-bold">{task.task}</td>
                <td>{task.db_id}</td>
                <td>{task.started_at}</td>
                <td>{task.ended_at}</td>
                <td>{task.duration}</td>
                <td>
                  <Link
                    className="link text-bold"
                    to={`/admin/troubleshooting/tasks/${task.id}`}
                  >{t`View`}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {
          // render 'children' so that the invididual task modals show up
          children
        }
      </Box>
    );
  }
}

export default TasksApp;
