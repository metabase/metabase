import { useAsync } from "react-use";
import { t } from "ttag";

import { datasetApi } from "metabase/api";
import { useLazyGetBugReportDetailsQuery } from "metabase/api/bug-report";
import { useLazyListLogsQuery } from "metabase/api/logger";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { useDispatch, useSelector } from "metabase/redux";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";

import type { ErrorPayload, ReportableEntityName } from "./types";
import { getBrowserInfo, getEntityDetails, hasQueryData } from "./utils";

const maybeSerializeError = (key: string, value: any) => {
  if (value?.constructor.name === "Error") {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause,
    };
  }
  return value;
};

export const useErrorInfo = (
  { enabled }: { enabled?: boolean } = { enabled: true },
) => {
  const currentUser = useSelector(getUser);
  const isAdmin = useSelector(getUserIsAdmin);
  const dispatch = useDispatch();
  const location = window.location.href;
  const [getBugReportDetails] = useLazyGetBugReportDetailsQuery();
  const [listLogs] = useLazyListLogsQuery();

  return useAsync(async () => {
    if (!enabled) {
      return null;
    }
    // https://regexr.com/7ra8o
    const matches = location.match(
      /(question|model|dashboard|collection|metric)[[\/\#]([\d\w]+)/,
    );

    const entity = (matches?.[1] ?? undefined) as
      | ReportableEntityName
      | undefined;
    const id = matches?.[2] ?? "";

    const isAdHoc = entity === "question" && window.location.href.includes("#");

    const entityInfoRequest = getEntityDetails({
      entity,
      id,
      isAdHoc,
      dispatch,
    });
    const bugReportDetailsRequest = isAdmin
      ? getBugReportDetails().unwrap().catch(nullOnCatch)
      : Promise.resolve(null);

    const logsRequest: any = isAdmin
      ? listLogs().unwrap().catch(nullOnCatch)
      : Promise.resolve(null);

    const frontendErrors = console?.errorBuffer?.map?.((errArray) =>
      errArray
        .map((errLine: any) => JSON.stringify(errLine, maybeSerializeError))
        .join(""),
    );

    const settledPromises = await Promise.allSettled([
      entityInfoRequest,
      bugReportDetailsRequest,
      logsRequest,
    ]);

    const [entityInfo, bugReportDetails, logs] = settledPromises.map(
      (promise: any) => promise.value,
    );

    const queryResults =
      hasQueryData(entity) &&
      entityInfo?.dataset_query &&
      (await runRtkEndpoint(
        entityInfo.dataset_query,
        dispatch,
        datasetApi.endpoints.getAdhocQuery,
      ).catch(nullOnCatch));

    // if this is an ad-hoc exploration on top of a saved question, fetch the original card
    if (hasQueryData(entity) && entityInfo?.original_card_id) {
      entityInfo.originalCard = await getEntityDetails({
        entity,
        id: entityInfo.original_card_id,
        dispatch,
      });
    }

    const filteredLogs = logs?.slice?.(0, 100);
    const backendErrors = logs?.filter?.((log: any) => log.level === "ERROR");

    const userLogs = currentUser
      ? logs?.filter(
          (log: any) =>
            log?.msg?.includes?.(`{:metabase-user-id ${currentUser.id}}`) ||
            log?.msg?.includes?.(` userID: ${currentUser.id} `),
        )
      : [];

    const browserInfo = getBrowserInfo();

    const payload: ErrorPayload = {
      reporter: {
        name: currentUser
          ? `${currentUser.first_name} ${currentUser.last_name}`
          : "",
        email: currentUser ? currentUser.email : "",
      },
      url: location,
      entityInfo,
      entityName: entity,
      localizedEntityName: getLocalizedEntityName(entity),
      queryResults,
      logs: filteredLogs,
      frontendErrors,
      backendErrors,
      userLogs,
      bugReportDetails,
      browserInfo,
    };

    return payload;
  }, [enabled, getBugReportDetails, listLogs]);
};

const nullOnCatch = () => null;

const getLocalizedEntityName = (entityName?: ReportableEntityName) => {
  switch (entityName) {
    case "question":
      return t`question`;
    case "model":
      return t`model`;
    case "dashboard":
      return t`dashboard`;
    case "collection":
      return t`collection`;
    default:
      return entityName;
  }
};
