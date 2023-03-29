import _ from "underscore";
import { parse as urlParse } from "url";
import querystring from "querystring";
import { Card, Dataset, VisualizationSettings } from "metabase-types/api";
import * as Urls from "metabase/lib/urls";
import { PartialBy } from "metabase/core/types";

interface GetDownloadButtonParamsInput {
  type: string;
  params: Record<string, unknown>;
  card: PartialBy<Card, "id">;
  visualizationSettings?: VisualizationSettings;
  result?: Dataset;
  uuid?: string;
  token?: string;
  dashcardId?: number;
  dashboardId?: number;
}

export const getDownloadButtonParams = ({
  type,
  params,
  card,
  visualizationSettings,
  result,
  uuid,
  token,
  dashcardId,
  dashboardId,
}: GetDownloadButtonParamsInput) => {
  const isSecureDashboardEmbedding = dashcardId != null && token != null;
  if (isSecureDashboardEmbedding) {
    return {
      method: "GET",
      url: `api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${card.id}/${type}`,
      params,
    };
  }

  const isDashboard = dashboardId != null && dashcardId != null;
  if (isDashboard) {
    return {
      method: "POST",
      url: `api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${card.id}/query/${type}`,
      params: { parameters: JSON.stringify(result?.json_query?.parameters) },
    };
  }

  const isPublicQuestion = uuid != null;
  if (isPublicQuestion) {
    return {
      method: "GET",
      url: Urls.publicQuestion(uuid, type),
      params: { parameters: JSON.stringify(result?.json_query?.parameters) },
    };
  }

  const isEmbeddedQuestion = token != null;
  if (isEmbeddedQuestion) {
    // Parse the query string part of the URL (e.g. the `?key=value` part) into an object. We need to pass them this
    // way to the `DownloadButton` because it's a form which means we need to insert a hidden `<input>` for each param
    // we want to pass along. For whatever wacky reason the /api/embed endpoint expect params like ?key=value instead
    // of like ?params=<json-encoded-params-array> like the other endpoints do.
    const query = urlParse(window.location.href).query; // get the part of the URL that looks like key=value
    const params = query && querystring.parse(query); // expand them out into a map

    return {
      method: "GET",
      url: Urls.embedCard(token, type),
      params: params,
    };
  }

  const isSavedQuery = card?.id != null;
  if (isSavedQuery) {
    return {
      method: "POST",
      url: `api/card/${card.id}/query/${type}`,
      params: { parameters: JSON.stringify(result?.json_query?.parameters) },
    };
  }

  const isUnsavedQuery = card && !card.id;
  if (isUnsavedQuery) {
    return {
      url: `api/dataset/${type}`,
      method: "POST",
      params: {
        query: JSON.stringify(_.omit(result?.json_query, "constraints")),
        visualization_settings: JSON.stringify(visualizationSettings),
      },
    };
  }

  return null;
};
