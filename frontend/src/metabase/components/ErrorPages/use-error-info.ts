import { useAsync } from "react-use";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { UtilApi, MetabaseApi } from "metabase/services";

import type { ErrorPayload, ReportableEntityName } from "./types";
import { getEntityDetails, hasQueryData } from "./utils";

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

    const isAdHoc = entity === "question" && window.location.href.includes("#");

    const entityInfoRequest = getEntityDetails({ entity, id, isAdHoc });
    const bugReportDetailsRequest = isAdmin
      ? UtilApi.bug_report_details().catch(nullOnCatch)
      : Promise.resolve(null);

    const logsRequest: any = isAdmin
      ? UtilApi.logs().catch(nullOnCatch)
      : Promise.resolve(null);

    // @ts-expect-error non-standard error property
    const frontendErrors = console?.errorBuffer?.map?.(errArray =>
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
      (await MetabaseApi.dataset(entityInfo.dataset_query).catch(nullOnCatch));

    // if this is an ad-hoc exploration on top of a saved question, fetch the original card
    if (hasQueryData(entity) && entityInfo?.original_card_id) {
      entityInfo.originalCard = await getEntityDetails({
        entity,
        id: entityInfo.original_card_id,
      });
    }

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
      localizedEntityName: getLocalizedEntityName(entity),
      queryResults,
      logs: filteredLogs,
      frontendErrors,
      backendErrors,
      userLogs,
      bugReportDetails,
    };

    return payload;
  }, [enabled]);
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
