import { taskApi } from "metabase/api";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";

/**
 * @deprecated use "metabase/api" instead
 */
export default createEntity({
  name: "tasks",
  path: "/api/task",

  api: {
    create: () => {
      throw new TypeError("Tasks.api.create is not supported");
    },
    update: () => {
      throw new TypeError("Tasks.api.update is not supported");
    },
    delete: () => {
      throw new TypeError("Tasks.api.delete is not supported");
    },
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(entityQuery, dispatch, taskApi.endpoints.listTasks),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        taskApi.endpoints.getTask,
      ),
  },
});
