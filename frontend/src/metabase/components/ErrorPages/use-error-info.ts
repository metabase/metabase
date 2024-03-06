import { useAsync } from "react-use";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { UtilApi, MetabaseApi, SessionApi } from "metabase/services";

import type { ErrorPayload, ReportableEntityName } from "./types";
import { getEntityDetails } from "./utils";

export const useErrorInfo = (
  { enabled }: { enabled?: boolean } = { enabled: true },
) => {
  const currentUser = useSelector(getCurrentUser);
  const isAdmin = useSelector(getUserIsAdmin);
  const location = window.location.href;

  return useAsync(async () => {
    if (!enabled) {
      return null;
    }
    // https://regexr.com/7ra8o
    const matches = location.match(
      /(question|model|dashboard|collection)[[\/\#]([\d\w]+)/,
    );

    const entity = (matches?.[1] ?? undefined) as
      | ReportableEntityName
      | undefined;
    const id = matches?.[2] ?? "";

    const entityInfoRequest = getEntityDetails({ entity, id });
    const bugReportDetailsRequest = isAdmin
      ? UtilApi.bug_report_details()
      : Promise.resolve(null);

    const sessionPropertiesRequest = SessionApi.properties();
    const logsRequest: any = isAdmin ? UtilApi.logs() : Promise.resolve(null);

    /* eslint-disable no-console */
    // @ts-expect-error I'm sorry
    const frontendErrors = console.errorBuffer;
    /* eslint-enable no-console */

    const settledPromises = await Promise.allSettled([
      entityInfoRequest,
      bugReportDetailsRequest,
      sessionPropertiesRequest,
      logsRequest,
    ]);

    const [entityInfo, bugReportDetails, sessionProperties, logs] =
      settledPromises.map((promise: any) => promise.value);
    const queryData =
      entity === "question" &&
      entityInfo?.dataset_query &&
      (await MetabaseApi.dataset(entityInfo.dataset_query));

    const filteredLogs = logs?.slice?.(0, 100);
    const backendErrors = logs?.filter?.((log: any) => log.level === "ERROR");

    const userLogs = logs?.filter(
      (log: any) =>
        log?.msg?.includes?.(`{:metabase-user-id ${currentUser.id}}`) ||
        log?.msg?.includes?.(` userID: ${currentUser.id} `),
    );

    const payload: ErrorPayload = {
      url: location,
      entityInfo,
      entityName: entity,
      ...(queryData ? { queryData } : undefined),
      logs: filteredLogs,
      frontendErrors,
      backendErrors,
      userLogs,
      instanceInfo: {
        sessionProperties,
        bugReportDetails,
      },
    };

    return payload;
  }, [enabled]);
};
