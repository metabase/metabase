import React from "react";
import { t } from "ttag";
import { Box, Flex } from "grid-styled";

import Database from "metabase/entities/databases";
import Task from "metabase/entities/tasks";

import AdminHeader from "metabase/components/AdminHeader";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Tooltip from "metabase/components/Tooltip";

@Task.loadList({
  pageSize: 50,
})
@Database.loadList()
class TasksApp extends React.Component {
  render() {
    const {
      tasks,
      databases,
      page,
      pageSize,
      onNextPage,
      onPreviousPage,
      children,
    } = this.props;
    const db_id_to_engine = {};
    for (const db of databases) {
      db_id_to_engine[db.id] = db.engine;
    }
    return (
      <Box p={3}>
        <Flex align="center">
          <Flex align="center">
            <AdminHeader title={t`Troubleshooting logs`} />
            <Tooltip
              tooltip={t`Trying to get to the bottom of something? This section shows logs of Metabase's background tasks, which can help shed light on what's going on.`}
            >
              <Icon
                name="info"
                ml={1}
                style={{ marginTop: 5 }}
                className="text-brand-hover cursor-pointer text-medium"
              />
            </Tooltip>
          </Flex>
          <Flex align="center" ml="auto">
            <span className="text-bold mr1">
              {page * pageSize + 1} - {page * pageSize + tasks.length}
            </span>
            <IconWrapper onClick={onPreviousPage} disabled={!onPreviousPage}>
              <Icon name="chevronleft" />
            </IconWrapper>
            <IconWrapper small onClick={onNextPage} disabled={!onNextPage}>
              <Icon name="chevronright" />
            </IconWrapper>
          </Flex>
        </Flex>

        <table className="ContentTable mt2">
          <thead>
            <tr>
              <th>{t`Task`}</th>
              <th>{t`DB ID`}</th>
              <th>{t`Engine`}</th>
              <th>{t`Started at`}</th>
              <th>{t`Ended at`}</th>
              <th>{t`Duration (ms)`}</th>
              <th>{t`Details`}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(task => (
              <tr key={task.id}>
                <td className="text-bold">{task.task}</td>
                <td>{task.db_id}</td>
                <td>
                  {task.db_id
                    ? db_id_to_engine[task.db_id] || "Unknown engine"
                    : null}
                </td>
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
