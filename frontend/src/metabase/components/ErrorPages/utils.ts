import { b64url_to_utf8 } from "metabase/lib/encoding";
import { CardApi, CollectionsApi, DashboardApi } from "metabase/services";

import type { ReportableEntityName, ErrorPayload } from "./types";

export function downloadObjectAsJson(
  exportObj: ErrorPayload,
  exportName: string,
) {
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(exportObj, null, 2));
  const downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("aria-label", "download diagnostic info");
  downloadAnchorNode.setAttribute("download", exportName + ".json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export const getEntityDetails = ({
  entity,
  id,
  isAdHoc,
}: {
  entity?: ReportableEntityName;
  id?: string;
  isAdHoc?: boolean;
}) => {
  if (!id || !entity) {
    return Promise.resolve(null);
  }

  switch (entity) {
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
      return CardApi.get({ cardId: id }).catch(nullOnCatch);
    case "dashboard":
      return DashboardApi.get({ id }).catch(nullOnCatch);
    case "collection":
      return CollectionsApi.get({ id }).catch(nullOnCatch);
    default:
      return Promise.resolve(null);
  }
};

export const hasQueryData = (
  entityName?: ReportableEntityName | null,
): boolean => !!entityName && ["question", "model"].includes(entityName);

const nullOnCatch = () => null;
