import { t } from "ttag";
import _ from "underscore";

import api, { GET, POST } from "metabase/lib/api";
import { isWithinIframe } from "metabase/lib/dom";
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

export type ResourceType = "question" | "dashcard" | "ad-hoc-question";
export type ResourceAccessedVia =
  | "internal"
  | "public-link"
  | "static-embed"
  | "interactive-iframe-embed"
  | "sdk-embed";

export type DownloadedResourceInfo = {
  resourceType: ResourceType;
  accessedVia: ResourceAccessedVia;
};

const getDownloadedResourceType = ({
  dashboardId,
  dashcardId,
  uuid,
  token,
  question,
}: Partial<DownloadQueryResultsOpts>): DownloadedResourceInfo => {
  const cardId = question?.id();

  const isInIframe = isWithinIframe();

  if (dashcardId != null && token != null) {
    return { resourceType: "dashcard", accessedVia: "static-embed" };
  } else if (dashboardId != null && uuid != null) {
    return { resourceType: "dashcard", accessedVia: "public-link" };
  } else if (dashboardId != null && dashcardId != null) {
    return {
      resourceType: "dashcard",
      accessedVia: isInIframe ? "interactive-iframe-embed" : "internal",
    };
  } else if (uuid != null) {
    return { resourceType: "question", accessedVia: "public-link" };
  } else if (token != null) {
    return { resourceType: "question", accessedVia: "static-embed" };
  } else if (cardId != null) {
    return {
      resourceType: "question",
      accessedVia: isInIframe ? "interactive-iframe-embed" : "internal",
    };
  } else {
    return {
      resourceType: "ad-hoc-question",
      accessedVia: isInIframe ? "interactive-iframe-embed" : "internal",
    };
  }
};

export const downloadQueryResults =
  (opts: DownloadQueryResultsOpts) => async () => {
    const { resourceType, accessedVia } = getDownloadedResourceType(opts);
    trackDownloadResults({
      resourceType,
      accessedVia,
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

  // Formatting is always enabled for Excel
  const format_rows = enableFormatting && type !== "xlsx" ? "true" : "false";

  const { accessedVia, resourceType: resource } = getDownloadedResourceType({
    dashboardId,
    dashcardId,
    uuid,
    token,
    question,
  });

  // Public links use special endpoints that use uuids instead of ids
  if (accessedVia === "public-link") {
    if (resource === "dashcard") {
      return {
        method: "POST",
        url: `/api/public/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/${type}`,
        params: new URLSearchParams({ format_rows }),
        body: {
          parameters: result?.json_query?.parameters ?? [],
        },
      };
    }
    if (resource === "question" && uuid) {
      return {
        method: "GET",
        url: Urls.publicQuestion({ uuid, type, includeSiteUrl: false }),
        params: new URLSearchParams({
          parameters: JSON.stringify(result?.json_query?.parameters ?? []),
          format_rows,
        }),
      };
    }
  }

  // Static embeds use special endpoints that use signed tokens instead of ids
  if (accessedVia === "static-embed") {
    if (resource === "dashcard") {
      return {
        method: "GET",
        url: `/api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${type}`,
        params: Urls.getEncodedUrlSearchParams({ ...params, format_rows }),
      };
    }

    if (resource === "question" && token) {
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
  }

  // Normal endpoints, also used by internal, interactive embedding and sdk

  if (resource === "dashcard") {
    return {
      method: "POST",
      url: `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/query/${type}`,
      params: new URLSearchParams({ format_rows }),
      body: {
        parameters: result?.json_query?.parameters ?? [],
      },
    };
  }

  if (resource === "question") {
    return {
      method: "POST",
      url: `/api/card/${cardId}/query/${type}`,
      params: new URLSearchParams({ format_rows }),
      body: {
        parameters: result?.json_query?.parameters ?? [],
      },
    };
  }
  if (resource === "ad-hoc-question") {
    return {
      method: "POST",
      url: `/api/dataset/${type}`,
      params: new URLSearchParams({ format_rows }),
      body: {
        query: _.omit(result?.json_query ?? {}, "constraints"),
        visualization_settings: visualizationSettings ?? {},
      },
    };
  }

  throw new Error("Unknown resource type");
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
