import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { t } from "ttag";
import _ from "underscore";

import api, { GET, POST } from "metabase/lib/api";
import { isWithinIframe, openSaveDialog } from "metabase/lib/dom";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { saveChartImage } from "metabase/visualizations/lib/save-chart-image";
import { getCardKey } from "metabase/visualizations/lib/utils";
import type Question from "metabase-lib/v1/Question";
import type {
  DashCardId,
  DashboardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";
import type { DownloadsState, State } from "metabase-types/store";

import { trackDownloadResults } from "./downloads-analytics";

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

  const defaultAccessedVia = process.env.EMBEDDING_SDK_VERSION
    ? "sdk-embed"
    : isInIframe
    ? "interactive-iframe-embed"
    : "internal";

  if (dashcardId != null && token != null) {
    return { resourceType: "dashcard", accessedVia: "static-embed" };
  }

  if (dashboardId != null && uuid != null) {
    return { resourceType: "dashcard", accessedVia: "public-link" };
  }

  if (dashboardId != null && dashcardId != null) {
    return {
      resourceType: "dashcard",
      accessedVia: defaultAccessedVia,
    };
  }

  if (uuid != null) {
    return { resourceType: "question", accessedVia: "public-link" };
  }

  if (token != null) {
    return { resourceType: "question", accessedVia: "static-embed" };
  }

  if (cardId != null) {
    return {
      resourceType: "question",
      accessedVia: defaultAccessedVia,
    };
  }

  return {
    resourceType: "ad-hoc-question",
    accessedVia: defaultAccessedVia,
  };
};

export const downloadQueryResults = createAsyncThunk(
  "metabase/downloads/downloadQueryResults",
  async (opts: DownloadQueryResultsOpts, { dispatch }) => {
    const { resourceType, accessedVia } = getDownloadedResourceType(opts);
    trackDownloadResults({
      resourceType,
      accessedVia,
      exportType: opts.type,
    });

    if (opts.type === Urls.exportFormatPng) {
      downloadChart(opts);
    } else {
      dispatch(downloadDataset({ opts, id: Date.now() }));
    }
  },
);

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

export const downloadDataset = createAsyncThunk(
  "metabase/downloads/downloadDataset",
  async ({ opts, id }: { opts: DownloadQueryResultsOpts; id: number }) => {
    const params = getDatasetParams(opts);
    const response = await getDatasetResponse(params);
    const name = getDatasetFileName(response.headers, opts.type);
    const fileContent = await response.blob();
    openSaveDialog(name, fileContent);

    return { id, name };
  },
);

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

  // Normal endpoints used by internal, interactive embedding, and SDK

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

export const getDownloads = (state: State) => state.downloads;
export const hasActiveDownloads = (state: State) =>
  state.downloads.some(download => download.status === "in-progress");

const initialState: DownloadsState = [];

const downloads = createSlice({
  name: "metabase/downloads",
  initialState,
  reducers: {
    clearAll: () => initialState,
  },
  extraReducers: builder => {
    builder
      .addCase(downloadDataset.pending, (state, action) => {
        const title = t`Results for ${
          action.meta.arg.opts.question.card().name
        }`;
        state.push({
          id: action.meta.arg.id,
          title,
          status: "in-progress",
        });
      })
      .addCase(downloadDataset.fulfilled, (state, action) => {
        const download = state.find(item => item.id === action.meta.arg.id);
        if (download) {
          download.status = "complete";
          download.title = action.payload.name;
        }
      })
      .addCase(downloadDataset.rejected, (state, action) => {
        const download = state.find(item => item.id === action.meta.arg.id);
        if (download) {
          download.status = "error";
          download.error =
            action.error.message ?? t`Could not download the file`;
        }
      });
  },
});

export const {
  actions: { clearAll },
} = downloads;
export const { reducer } = downloads;
