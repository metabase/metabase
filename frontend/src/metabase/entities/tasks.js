import { createEntity } from "metabase/lib/entities";

export default createEntity({
  name: "tasks",
  path: "/api/tasks/",

  api: {
    list: async () => {
      return [
        {
          id: 1,
          task: "task name",
          dbId: 1,
          started_at: "date",
          ended_at: "date",
          duration: 300,
          task_details: "json json json",
        },
        {
          id: 2,
          task: "task name",
          dbId: 1,
          started_at: "date",
          ended_at: "date",
          duration: 300,
          task_details: "json json json",
        },
        {
          id: 3,
          task: "task name",
          dbId: 1,
          started_at: "date",
          ended_at: "date",
          duration: 300,
          task_details: "json json json",
        },
        {
          id: 4,
          task: "task name",
          dbId: 1,
          started_at: "date",
          ended_at: "date",
          duration: 300,
          task_details: "json json json",
        },
        {
          id: 5,
          task: "task name",
          dbId: 1,
          started_at: "date",
          ended_at: "date",
          duration: 300,
          task_details: "json json json",
        },
      ];
    },
  },
  objectActions: {},
});
