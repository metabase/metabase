import { match, P } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import api, { GET, POST } from "metabase/lib/api";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { saveChartImage } from "metabase/visualizations/lib/save-chart-image";
import { getCardKey } from "metabase/visualizations/lib/utils";
import type Question from "metabase-lib/v1/Question";
import type {
  DashboardId,
  DashCardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";

import { trackDownloadResults } from "./downloading-analytics";

export interface DownloadQueryResultsOpts {
  type: string;
  question: Question;
  result: Dataset;
  enableFormatting?: boolean;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  uuid?: string;
  token?: string;
  params?: Record<string, unknown>;
  visualizationSettings?: VisualizationSettings;
}

interface DownloadQueryResultsParams {
  method: string;
  url: string;
  body?: Record<string, unknown>;
  params?: URLSearchParams | string;
}

export type DownloadedResourceType =
  | "dashcard"
  | "question"
  | "public-dashcard"
  | "public-question"
  | "static-embed-dashcard"
  | "static-embed-question"
  | "dataset";

const getDownloadedResourceType = ({
  dashboardId,
  dashcardId,
  uuid,
  token,
  question,
}: DownloadQueryResultsOpts): DownloadedResourceType => {
  return match({
    dashboardId,
    dashcardId,
    uuid,
    token,
    question,
    cardId: question.id(),
  })
    .with(
      { dashcardId: P.nonNullable, token: P.nonNullable },
      () => "static-embed-dashcard" as const,
    )
    .with(
      { dashboardId: P.nonNullable, uuid: P.nonNullable },
      () => "public-dashcard" as const,
    )
    .with(
      { dashboardId: P.nonNullable, dashcardId: P.nonNullable },
      () => "dashcard" as const,
    )
    .with({ uuid: P.nonNullable }, () => "public-question" as const)
    .with({ token: P.nonNullable }, () => "static-embed-question" as const)
    .with({ cardId: P.nonNullable }, () => "question" as const)
    .otherwise(() => "dataset" as const);
};

export const downloadQueryResults =
  (opts: DownloadQueryResultsOpts) => async () => {
    const downloadedResource = getDownloadedResourceType(opts);
    trackDownloadResults({
      resourceType: downloadedResource,
      exportType: opts.type,
    });
    if (opts.type === Urls.exportFormatPng) {
      await downloadChart(opts);
    } else {
      await downloadDataset(opts);
    }
  };

const downloadChart = async ({
  question,
  dashcardId,
}: DownloadQueryResultsOpts) => {
  const fileName = getChartFileName(question);
  const chartSelector =
    dashcardId != null
      ? `[data-dashcard-key='${dashcardId}']`
      : `[data-card-key='${getCardKey(question.id())}']`;
  await saveChartImage(chartSelector, fileName);
};

const downloadDataset = async (opts: DownloadQueryResultsOpts) => {
  const params = getDatasetParams(opts);
  const response = await getDatasetResponse(params);
  const fileName = getDatasetFileName(response.headers, opts.type);
  const fileContent = await response.blob();
  openSaveDialog(fileName, fileContent);
};

const getDatasetParams = ({
  type,
  question,
  dashboardId,
  dashcardId,
  enableFormatting,
  uuid,
  token,
  params = {},
  result,
  visualizationSettings,
}: DownloadQueryResultsOpts): DownloadQueryResultsParams => {
  const cardId = question.id();
  const isQuestionInStaticEmbedDashboard =
    dashcardId != null && cardId != null && token != null;

  // Formatting is always enabled for Excel
  const format_rows = enableFormatting && type !== "xlsx" ? "true" : "false";

  if (isQuestionInStaticEmbedDashboard) {
    return {
      method: "GET",
      url: `/api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${type}`,
      params: Urls.getEncodedUrlSearchParams({ ...params, format_rows }),
    };
  }

  const isQuestionInPublicDashboard =
    dashboardId != null && cardId != null && uuid != null;
  if (isQuestionInPublicDashboard) {
    return {
      method: "POST",
      url: `/api/public/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/${type}`,
      params: new URLSearchParams({ format_rows }),
      body: {
        parameters: result?.json_query?.parameters ?? [],
      },
    };
  }

  const isDashboard =
    dashboardId != null && dashcardId != null && cardId != null;
  if (isDashboard) {
    return {
      method: "POST",
      url: `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/query/${type}`,
      params: new URLSearchParams({ format_rows }),
      body: {
        parameters: result?.json_query?.parameters ?? [],
      },
    };
  }

  const isPublicQuestion = uuid != null;
  if (isPublicQuestion) {
    return {
      method: "GET",
      url: Urls.publicQuestion({ uuid, type, includeSiteUrl: false }),
      params: new URLSearchParams({
        parameters: JSON.stringify(result?.json_query?.parameters ?? []),
        format_rows,
      }),
    };
  }

  const isEmbeddedQuestion = token != null;
  if (isEmbeddedQuestion) {
    // For whatever wacky reason the /api/embed endpoint expect params like ?key=value instead
    // of like ?params=<json-encoded-params-array> like the other endpoints do.
    const params = new URLSearchParams(window.location.search);
    params.set("format_rows", format_rows);
    return {
      method: "GET",
      url: Urls.embedCard(token, type),
      params,
    };
  }

  const isSavedQuery = cardId != null;
  if (isSavedQuery) {
    return {
      method: "POST",
      url: `/api/card/${cardId}/query/${type}`,
      params: new URLSearchParams({ format_rows }),
      body: {
        parameters: result?.json_query?.parameters ?? [],
      },
    };
  }

  return {
    method: "POST",
    url: `/api/dataset/${type}`,
    params: new URLSearchParams({ format_rows }),
    body: {
      query: _.omit(result?.json_query ?? {}, "constraints"),
      visualization_settings: visualizationSettings ?? {},
    },
  };
};

export function getDatasetDownloadUrl(
  url: string,
  params?: URLSearchParams | string,
) {
  url = url.replace(api.basename, ""); // make url relative if it's not
  if (params) {
    url += `?${params.toString()}`;
  }

  return url;
}

interface TransformResponseProps {
  response?: Response;
}

const getDatasetResponse = ({
  url,
  method,
  body,
  params,
}: DownloadQueryResultsParams) => {
  const requestUrl = getDatasetDownloadUrl(url, params);

  if (method === "POST") {
    // BE expects the body to be form-encoded :(
    const formattedBody = new URLSearchParams();
    if (body != null) {
      for (const key in body) {
        formattedBody.append(key, JSON.stringify(body[key]));
      }
    }
    return POST(requestUrl, {
      formData: true,
      fetch: true,
      transformResponse: ({ response }: TransformResponseProps) =>
        checkNotNull(response),
    })({
      formData: formattedBody,
    });
  } else {
    return GET(requestUrl, {
      fetch: true,
      transformResponse: ({ response }: TransformResponseProps) =>
        checkNotNull(response),
    })();
  }
};

const getDatasetFileName = (headers: Headers, type: string) => {
  const header = headers.get("Content-Disposition") ?? "";
  const headerContent = decodeURIComponent(header);
  const fileNameMatch = headerContent.match(/filename="(?<fileName>.+)"/);

  return (
    fileNameMatch?.groups?.fileName ||
    `query_result_${new Date().toISOString()}.${type}`
  );
};

const getChartFileName = (question: Question) => {
  const name = question.displayName() ?? t`New question`;
  const date = new Date().toLocaleString();
  return `${name}-${date}.png`;
};

const openSaveDialog = (fileName: string, fileContent: Blob) => {
  const url = URL.createObjectURL(fileContent);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();

  URL.revokeObjectURL(url);
  link.remove();
};
