import { t } from "ttag";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import { getCardKey } from "metabase/visualizations/lib/utils";
import { saveChartImage } from "metabase/visualizations/lib/save-chart-image";
import {
  DashboardId,
  DashCardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";
import Question from "metabase-lib/Question";

export interface DownloadQueryContext {
  question: Question;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  uuid?: string;
  token?: string;
  result?: Dataset;
  params?: Record<string, unknown>;
  visualizationSettings?: VisualizationSettings;
}

interface DownloadQueryParams {
  method: string;
  url: string;
  params: Record<string, string>;
}

export const downloadQueryResults =
  (type: string, context: DownloadQueryContext) => async () => {
    const params = getDownloadQueryParams(type, context);
    const response = await getDownloadQueryResponse(params);
    const fileName = getDownloadFileName(response.headers, type);
    const fileContent = await response.blob();
    openSaveDialog(fileName, fileContent);
  };

const getDownloadQueryParams = (
  type: string,
  {
    question,
    dashboardId,
    dashcardId,
    uuid,
    token,
    params = {},
    result,
    visualizationSettings,
  }: DownloadQueryContext,
): DownloadQueryParams => {
  const cardId = question.id();
  const isSecureDashboardEmbedding = dashcardId != null && token != null;
  if (isSecureDashboardEmbedding) {
    return {
      method: "GET",
      url: `api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${type}`,
      params: Object.fromEntries(Urls.extractQueryParams(params)),
    };
  }

  const isDashboard = dashboardId != null && dashcardId != null;
  if (isDashboard) {
    return {
      method: "POST",
      url: `api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/query/${type}`,
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

  const isSavedQuery = cardId != null;
  if (isSavedQuery) {
    return {
      method: "POST",
      url: `api/card/${cardId}/query/${type}`,
      params: { parameters: JSON.stringify(result?.json_query?.parameters) },
    };
  }

  return {
    url: `api/dataset/${type}`,
    method: "POST",
    params: {
      query: JSON.stringify(_.omit(result?.json_query, "constraints")),
      visualization_settings: JSON.stringify(visualizationSettings),
    },
  };
};

const getDownloadQueryResponse = ({
  url,
  method,
  params,
}: DownloadQueryParams) => {
  const body = new URLSearchParams(params);

  if (method === "POST") {
    return fetch(url, { method, body });
  } else {
    return fetch(`${url}?${body}`);
  }
};

const getDownloadFileName = (headers: Headers, type: string) => {
  const header = headers.get("Content-Disposition") ?? "";
  const headerContent = decodeURIComponent(header);
  const fileNameMatch = headerContent.match(/filename="(?<fileName>.+)"/);

  return (
    fileNameMatch?.groups?.fileName ||
    `query_result_${new Date().toISOString()}.${type}`
  );
};

const openSaveDialog = (fileName: string, fileContent: Blob) => {
  const url = URL.createObjectURL(fileContent);
  const link = document.createElement(`a`);
  link.href = url;
  link.setAttribute(`download`, fileName);
  document.body.appendChild(link);
  link.click();

  URL.revokeObjectURL(url);
  link.remove();
};

export const downloadChartImage =
  ({ question }: DownloadQueryContext) =>
  async () => {
    const fileName = getImageFileName(question);
    const chartSelector = `[data-card-key='${getCardKey(question.id())}']`;
    await saveChartImage(chartSelector, fileName);
  };

const getImageFileName = (question: Question) => {
  const name = question.displayName() ?? t`New question`;
  const date = new Date().toLocaleString();
  return `${name}-${date}.png`;
};
