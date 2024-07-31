import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { t } from "ttag";
import _ from "underscore";

import api, { GET, POST } from "metabase/lib/api";
import { openSaveDialog } from "metabase/lib/dom";
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
import type { DownloadsState, State } from "metabase-types/store";

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

export const downloadQueryResults = createAsyncThunk(
  "metabase/downloads/downloadQueryResults",
  async (opts: DownloadQueryResultsOpts, { dispatch }) => {
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
  const isQuestionInStaticEmbedDashboard =
    dashcardId != null && cardId != null && token != null;

  // Formatting is always enabled for Excel
  const format_rows = enableFormatting && type !== "xlsx" ? "true" : "false";

  if (isQuestionInStaticEmbedDashboard) {
    return {
      method: "GET",
      url: `/api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${type}`,
      params: new URLSearchParams({
        parameters: JSON.stringify(params),
        format_rows,
      }),
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
    const params = new URLSearchParams(window.location.search);
    return {
      method: "GET",
      url: Urls.embedCard(token, type),
      params: new URLSearchParams({
        parameters: JSON.stringify(Object.fromEntries(params)),
        format_rows,
      }),
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
