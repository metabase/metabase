import {
  createSlice,
  isAnyOf,
  isFulfilled,
  isPending,
  isRejected,
} from "@reduxjs/toolkit";
import { t } from "ttag";
import _ from "underscore";

import { waitUntilNextFramePainted } from "metabase/common/utils/wait-until-next-frame-paints";
import { trackExportDashboardToPDF } from "metabase/dashboard/analytics";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/dashboard/constants";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import api, { GET, POST } from "metabase/lib/api";
import { isWithinIframe, openSaveDialog } from "metabase/lib/dom";
import { createAsyncThunk } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import { getTokenFeature } from "metabase/setup/selectors";
import { saveChartImage } from "metabase/visualizations/lib/save-chart-image";
import { saveDashboardPdf } from "metabase/visualizations/lib/save-dashboard-pdf";
import { getCardKey } from "metabase/visualizations/lib/utils";
import type Question from "metabase-lib/v1/Question";
import type {
  DashCardId,
  Dashboard,
  DashboardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";
import type { DownloadsState, State } from "metabase-types/store";

import { trackDownloadResults } from "./downloads-analytics";

export interface DownloadQueryResultsOpts {
  type: string;
  question: Question;
  result: Dataset;
  enableFormatting?: boolean;
  enablePivot?: boolean;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  uuid?: EntityUuid | null;
  token?: EntityToken | null;
  documentUuid?: string;
  documentId?: number;
  params?: Record<string, unknown>;
  visualizationSettings?: VisualizationSettings;
}

interface DownloadQueryResultsParams {
  method: string;
  url: string;
  body?: Record<string, unknown>;
  params?: URLSearchParams | string;
}

export type ResourceType =
  | "question"
  | "dashcard"
  | "document-card"
  | "ad-hoc-question";
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

/**
 * Determine how the resource is being accessed (public link, embed, etc.)
 */
const getAccessedVia = (
  hasUuid: boolean,
  hasToken: boolean,
): ResourceAccessedVia => {
  if (hasToken) {
    return "static-embed";
  }
  if (hasUuid) {
    return "public-link";
  }
  if (isEmbeddingSdk()) {
    return "sdk-embed";
  }
  if (isWithinIframe()) {
    return "interactive-iframe-embed";
  }
  return "internal";
};

/**
 * Determine the type of resource being downloaded (dashcard, question, etc.)
 */
const getResourceType = ({
  dashboardId,
  dashcardId,
  documentId,
  documentUuid,
  cardId,
}: {
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  documentId?: number;
  documentUuid?: string;
  cardId?: number | null;
}): ResourceType => {
  if (dashcardId != null && dashboardId != null) {
    return "dashcard";
  }
  if (documentId != null || documentUuid != null) {
    return "document-card";
  }
  if (cardId != null) {
    return "question";
  }
  return "ad-hoc-question";
};

const getDownloadedResourceType = ({
  dashboardId,
  dashcardId,
  uuid,
  token,
  documentUuid,
  documentId,
  question,
}: Partial<DownloadQueryResultsOpts>): DownloadedResourceInfo => {
  const cardId = question?.id();
  const hasUuid = uuid != null || documentUuid != null;
  const hasToken = token != null;

  return {
    resourceType: getResourceType({
      dashboardId,
      dashcardId,
      documentId,
      documentUuid,
      cardId,
    }),
    accessedVia: getAccessedVia(hasUuid, hasToken),
  };
};

export const downloadToImage = createAsyncThunk(
  "metabase/downloads/downloadToImage",
  async (
    {
      opts: { question, dashcardId },
      id,
    }: { opts: DownloadQueryResultsOpts; id: number },
    { getState },
  ) => {
    const isWhitelabeled = getTokenFeature(getState(), "whitelabel");
    const includeBranding = !isWhitelabeled;
    const fileName = getChartFileName(question, includeBranding);

    const chartSelector =
      dashcardId != null
        ? `[data-dashcard-key='${dashcardId}']`
        : `[data-card-key='${getCardKey(question.id())}']`;

    // Long-running main thread blocking operation incoming; wait until the loader is painted.
    await waitUntilNextFramePainted();

    await saveChartImage({
      selector: chartSelector,
      fileName,
      includeBranding,
    });

    return { id, fileName };
  },
);

export const downloadDashboardToPdf = createAsyncThunk(
  "metabase/downloads/downloadDashboardToPdf",
  async (
    { dashboard, id }: { dashboard: Dashboard; id: number },
    { getState },
  ) => {
    const isWhitelabeled = getTokenFeature(getState(), "whitelabel");
    const includeBranding = !isWhitelabeled;
    const cardNodeSelector = `#${DASHBOARD_PDF_EXPORT_ROOT_ID}`;
    const fileName = getDashboardPdfFileName(dashboard, includeBranding);

    // Long-running main thread blocking operation incoming; wait until the loader is painted.
    await waitUntilNextFramePainted();

    await saveDashboardPdf({
      fileName,
      selector: cardNodeSelector,
      dashboardName: dashboard.name,
      includeBranding,
    });

    trackExportDashboardToPDF({
      dashboardId: dashboard.id,
      dashboardAccessedVia: getAccessedVia(
        isUuid(dashboard.id),
        isJWT(dashboard.id),
      ),
    });

    return { id, fileName };
  },
);

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
      await dispatch(downloadToImage({ opts, id: Date.now() }));
    } else {
      await dispatch(downloadDataset({ opts, id: Date.now() }));
    }
  },
);

export const downloadDataset = createAsyncThunk(
  "metabase/downloads/downloadDataset",
  async ({ opts, id }: { opts: DownloadQueryResultsOpts; id: number }) => {
    const params = getDatasetParams(opts);
    const response = await getDatasetResponse(params);
    const fileName = getDatasetFileName(response.headers, opts.type);
    const fileContent = await response.blob();
    openSaveDialog(fileName, fileContent);

    return { id, fileName };
  },
);

type ExportParams = {
  format_rows: boolean;
  pivot_results: boolean;
};

const getPublicDashcardParams = (
  cardId: number,
  dashboardId: DashboardId,
  dashcardId: DashCardId,
  type: string,
  result: Dataset,
  exportParams: ExportParams,
): DownloadQueryResultsParams => ({
  method: "POST",
  url: `/api/public/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/${type}`,
  body: {
    parameters: result?.json_query?.parameters ?? [],
    ...exportParams,
  },
});

const getPublicDocumentCardParams = (
  cardId: number,
  documentUuid: string,
  type: string,
  result: Dataset,
  exportParams: ExportParams,
): DownloadQueryResultsParams => ({
  method: "POST",
  url: `/api/public/document/${documentUuid}/card/${cardId}/${type}`,
  body: {
    parameters: result?.json_query?.parameters ?? [],
    ...exportParams,
  },
});

const getPublicQuestionParams = (
  uuid: string,
  type: string,
  result: Dataset,
): DownloadQueryResultsParams => {
  const parameters = (result?.json_query?.parameters ?? []).map((param) => ({
    id: param.id,
    value: param.value,
  }));

  return {
    method: "GET",
    url: Urls.publicQuestion({ uuid, type, includeSiteUrl: false }),
    params: new URLSearchParams({
      parameters: JSON.stringify(parameters),
    }),
  };
};

const getEmbedDashcardParams = (
  token: EntityToken,
  cardId: number,
  dashcardId: DashCardId,
  type: string,
  params: Record<string, unknown>,
  exportParams: ExportParams,
): DownloadQueryResultsParams => ({
  method: "GET",
  url: `/api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${type}`,
  params: new URLSearchParams({
    parameters: JSON.stringify(params),
    ..._.mapObject(exportParams, (value) => String(value)),
  }),
});

const getEmbedQuestionParams = (
  token: EntityToken,
  type: string,
  exportParams: ExportParams,
): DownloadQueryResultsParams => {
  const params = new URLSearchParams(window.location.search);

  const convertSearchParamsToObject = (params: URLSearchParams) => {
    const object: Record<string, string | string[]> = {};
    for (const [key, value] of params.entries()) {
      if (object[key]) {
        object[key] = ([] as string[]).concat(
          object[key] as string | string[],
          value,
        );
      } else {
        object[key] = value;
      }
    }

    return object;
  };

  return {
    method: "GET",
    url: Urls.embedCard(token, type),
    params: new URLSearchParams({
      parameters: JSON.stringify(convertSearchParamsToObject(params)),
      ..._.mapObject(exportParams, (value) => String(value)),
    }),
  };
};

const getInternalDashcardParams = (
  cardId: number,
  dashboardId: DashboardId,
  dashcardId: DashCardId,
  type: string,
  result: Dataset,
  exportParams: ExportParams,
): DownloadQueryResultsParams => ({
  method: "POST",
  url: `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/query/${type}`,
  body: {
    parameters: result?.json_query?.parameters ?? [],
    ...exportParams,
  },
});

const getInternalDocumentCardParams = (
  cardId: number,
  documentId: number,
  type: string,
  result: Dataset,
  exportParams: ExportParams,
): DownloadQueryResultsParams => ({
  method: "POST",
  url: `/api/document/${documentId}/card/${cardId}/query/${type}`,
  body: {
    parameters: result?.json_query?.parameters ?? [],
    ...exportParams,
  },
});

const getInternalQuestionParams = (
  cardId: number,
  type: string,
  result: Dataset,
  exportParams: ExportParams,
): DownloadQueryResultsParams => ({
  method: "POST",
  url: `/api/card/${cardId}/query/${type}`,
  body: {
    parameters: result?.json_query?.parameters ?? [],
    ...exportParams,
  },
});

const getAdHocQuestionParams = (
  type: string,
  result: Dataset,
  visualizationSettings: VisualizationSettings | undefined,
  exportParams: ExportParams,
): DownloadQueryResultsParams => ({
  method: "POST",
  url: `/api/dataset/${type}`,
  body: {
    query: _.omit(result?.json_query ?? {}, "constraints"),
    visualization_settings: visualizationSettings ?? {},
    ...exportParams,
  },
});

const getDatasetParams = ({
  type,
  question,
  dashboardId,
  dashcardId,
  enableFormatting = false,
  enablePivot = false,
  uuid,
  token,
  documentUuid,
  documentId,
  params = {},
  result,
  visualizationSettings,
}: DownloadQueryResultsOpts): DownloadQueryResultsParams => {
  const cardId = question.id();

  const exportParams: ExportParams = {
    format_rows: enableFormatting,
    pivot_results: enablePivot,
  };

  const { accessedVia, resourceType } = getDownloadedResourceType({
    dashboardId,
    dashcardId,
    uuid,
    token,
    documentUuid,
    documentId,
    question,
  });

  // Public links use special endpoints that use uuids instead of ids
  if (accessedVia === "public-link") {
    if (resourceType === "dashcard") {
      return getPublicDashcardParams(
        cardId,
        checkNotNull(dashboardId),
        checkNotNull(dashcardId),
        type,
        result,
        exportParams,
      );
    }
    if (resourceType === "document-card" && documentUuid) {
      return getPublicDocumentCardParams(
        cardId,
        documentUuid,
        type,
        result,
        exportParams,
      );
    }
    if (resourceType === "question" && uuid) {
      return getPublicQuestionParams(uuid, type, result);
    }
  }

  // Static embeds use special endpoints that use signed tokens instead of ids
  if (accessedVia === "static-embed") {
    if (resourceType === "dashcard") {
      return getEmbedDashcardParams(
        checkNotNull(token),
        cardId,
        checkNotNull(dashcardId),
        type,
        params,
        exportParams,
      );
    }
    if (resourceType === "question" && token) {
      return getEmbedQuestionParams(token, type, exportParams);
    }
  }

  // Normal endpoints used by internal, interactive embedding, and SDK
  if (resourceType === "dashcard") {
    return getInternalDashcardParams(
      cardId,
      checkNotNull(dashboardId),
      checkNotNull(dashcardId),
      type,
      result,
      exportParams,
    );
  }

  if (resourceType === "document-card" && documentId) {
    return getInternalDocumentCardParams(
      cardId,
      documentId,
      type,
      result,
      exportParams,
    );
  }

  if (resourceType === "question") {
    return getInternalQuestionParams(cardId, type, result, exportParams);
  }

  if (resourceType === "ad-hoc-question") {
    return getAdHocQuestionParams(
      type,
      result,
      visualizationSettings,
      exportParams,
    );
  }

  throw new Error(
    `Unsupported download type: ${resourceType} via ${accessedVia}`,
  );
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

export const getChartFileName = (question: Question, branded: boolean) => {
  const name = question.displayName() ?? t`New question`;
  const date = new Date().toLocaleString();
  const fileName = `${name}-${date}.png`;
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Used explicitly in non-whitelabeled instances
  return branded ? `Metabase-${fileName}` : fileName;
};

export const getDashboardPdfFileName = (
  dashboard: Dashboard,
  branded: boolean,
) => {
  const originalFileName = `${dashboard.name}.pdf`;
  const fileName = branded
    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- Used explicitly in non-whitelabeled instances
      `Metabase - ${originalFileName}`
    : originalFileName;
  return fileName;
};

export const getDownloads = (state: State) => state.downloads.datasetRequests;
export const hasActiveDownloads = (state: State) =>
  state.downloads.datasetRequests.some(
    (download) => download.status === "in-progress",
  );

export const getIsDownloadingToImage = (state: State) =>
  state.downloads.isDownloadingToImage;

const initialState: DownloadsState = {
  isDownloadingToImage: false,
  datasetRequests: [],
};

const downloads = createSlice({
  name: "metabase/downloads",
  initialState,
  reducers: {
    clearAll: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(downloadDataset.pending, (state, action) => {
        state.datasetRequests.push({
          id: action.meta.arg.id,
          title: t`Results for ${action.meta.arg.opts.question.card().name}`,
          status: "in-progress",
        });
      })
      .addCase(downloadDashboardToPdf.pending, (state, action) => {
        state.datasetRequests.push({
          id: action.meta.arg.id,
          title: t`Dashboard for ${action.meta.arg.dashboard.name}`,
          status: "in-progress",
        });
      })
      .addCase(downloadToImage.pending, (state, action) => {
        state.datasetRequests.push({
          id: action.meta.arg.id,
          title: t`Image for ${action.meta.arg.opts.question.card().name}`,
          status: "in-progress",
        });
      })
      .addMatcher(
        isFulfilled(downloadDataset, downloadDashboardToPdf, downloadToImage),
        (state, action) => {
          const download = state.datasetRequests.find(
            (item) => item.id === action.meta.arg.id,
          );
          if (download) {
            download.status = "complete";
            download.title = action.payload.fileName;
          }
        },
      )
      .addMatcher(
        isRejected(downloadDataset, downloadDashboardToPdf, downloadToImage),
        (state, action) => {
          const download = state.datasetRequests.find(
            (item) => item.id === action.meta.arg.id,
          );
          if (download) {
            download.status = "error";
            download.error =
              action.error.message ?? t`Could not download the file`;
          }
        },
      );

    builder
      .addMatcher(
        isPending(downloadDashboardToPdf, downloadToImage),
        (state) => {
          state.isDownloadingToImage = true;
        },
      )
      .addMatcher(
        isAnyOf(
          isRejected(downloadDashboardToPdf, downloadToImage),
          isFulfilled(downloadDashboardToPdf, downloadToImage),
        ),
        (state) => {
          state.isDownloadingToImage = false;
        },
      );
  },
});

export const {
  actions: { clearAll },
} = downloads;
export const { reducer } = downloads;
