import Bowser from "bowser";

import { cardApi, collectionApi, dashboardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import type { DispatchFn } from "metabase/redux";
import { b64url_to_utf8 } from "metabase/utils/encoding";

import type { ReportableEntityName } from "./types";

export const getEntityDetails = ({
  entity,
  id,
  isAdHoc,
  dispatch,
}: {
  entity?: ReportableEntityName;
  id?: string;
  isAdHoc?: boolean;
  dispatch: DispatchFn;
}) => {
  if (!id || !entity) {
    return Promise.resolve(null);
  }

  switch (entity) {
    case "metric":
    case "question":
    case "model":
      if (isAdHoc) {
        try {
          const adhocQuestion = JSON.parse(b64url_to_utf8(id));
          return Promise.resolve(adhocQuestion);
        } catch (e) {
          return Promise.resolve("unable to decode ad-hoc question");
        }
      }
      return runRtkEndpoint({ id }, dispatch, cardApi.endpoints.getCard).catch(
        nullOnCatch,
      );
    case "dashboard":
      return runRtkEndpoint(
        { id },
        dispatch,
        dashboardApi.endpoints.getDashboard,
      ).catch(nullOnCatch);
    case "collection":
      return runRtkEndpoint(
        { id },
        dispatch,
        collectionApi.endpoints.getCollection,
      ).catch(nullOnCatch);
    default:
      return Promise.resolve(null);
  }
};

export const hasQueryData = (
  entityName?: ReportableEntityName | null,
): boolean =>
  !!entityName && ["question", "model", "metric"].includes(entityName);

export const getBrowserInfo = () => {
  const browser = Bowser.getParser(navigator.userAgent);
  const browserInfo = browser.getBrowser();

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    browserName: browserInfo.name || "unknown",
    browserVersion: browserInfo.version || "unknown",
    platform: browser.getPlatform().type || "unknown",
    os: browser.getOS().name || "unknown",
    osVersion: browser.getOS().version || "unknown",
  };
};

const nullOnCatch = () => null;
