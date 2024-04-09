import { createThunkAction } from "metabase/lib/redux";
import { TaskApi } from "metabase/services";

export const FETCH_JOB_INFO = "metabase/admin/tasks/FETCH_JOB_INFO";

export const fetchJobInfo = createThunkAction(
  FETCH_JOB_INFO,
  () => async () => {
    return await TaskApi.getJobsInfo();
  },
);
