import {
  createSlice,
  isAnyOf,
  isFulfilled,
  isPending,
  isRejected,
} from "@reduxjs/toolkit";
import { t } from "ttag";

import { type DownloadDatasetArgs, datasetApi } from "metabase/api/dataset";
import {
  type ExportFormat,
  exportFormatPng,
} from "metabase/common/types/export";
import { waitUntilNextFramePainted } from "metabase/common/utils/wait-until-next-frame-paints";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { DownloadsState, State } from "metabase/redux/store";
import { createAsyncThunk } from "metabase/redux/utils";
import { getTokenFeature } from "metabase/settings";
import { openSaveDialog } from "metabase/utils/dom";
import { isWithinIframe } from "metabase/utils/iframe";
import { isJWT } from "metabase/utils/jwt";
import { checkNotNull } from "metabase/utils/types";
import { isUuid } from "metabase/utils/uuid";
import { saveChartImage } from "metabase/visualizations/lib/save-chart-image";
import {
  DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID,
  DASHBOARD_PDF_EXPORT_ROOT_ID,
  saveDashboardPdf,
} from "metabase/visualizations/lib/save-dashboard-pdf";
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

import { trackDownloadResults, trackExportDashboardToPDF } from "../analytics";

export interface DownloadQueryResultsOpts {
  type: ExportFormat;
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
      parametersNodeSelector: `#${DASHBOARD_HEADER_PARAMETERS_PDF_EXPORT_NODE_ID}`,
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

    if (opts.type === exportFormatPng) {
      await dispatch(downloadToImage({ opts, id: Date.now() }));
    } else {
      await dispatch(downloadDataset({ opts, id: Date.now() }));
    }
  },
);

/**
 * Read a download response body as a Blob. When a query fails *after* the
 * download has started streaming, the server has already committed the HTTP
 * status, so it signals the failure by aborting the connection. That truncates
 * the response and makes `blob()` reject — surface a clean, localized error
 * instead of a raw network error like "Failed to fetch", so the user knows the
 * file did not download completely.
 */
export const readDownloadBlob = async (response: Response): Promise<Blob> => {
  try {
    return await response.blob();
  } catch {
    throw new Error(
      t`The download was interrupted and the file may be incomplete. Please try again.`,
    );
  }
};

export const downloadDataset = createAsyncThunk(
  "metabase/downloads/downloadDataset",
  async (
    { opts, id }: { opts: DownloadQueryResultsOpts; id: number },
    { dispatch },
  ) => {
    const promise = dispatch(
      datasetApi.endpoints.downloadDataset.initiate(
        getDownloadDatasetArgs(opts),
      ),
    );
    try {
      const response = await promise.unwrap();
      const fileName = getDatasetFileName(response.headers, opts.type);
      const fileContent = await readDownloadBlob(response);
      openSaveDialog(fileName, fileContent);

      return { id, fileName };
    } finally {
      promise.reset();
    }
  },
);

export const getDownloadDatasetArgs = ({
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
}: DownloadQueryResultsOpts): DownloadDatasetArgs => {
  const cardId = question.id();
  const parameters = result.json_query?.parameters ?? [];
  const exportOptions = {
    format: type,
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
      return {
        ...exportOptions,
        resourceType,
        accessedVia,
        cardId,
        dashboardId: checkNotNull(dashboardId),
        dashcardId: checkNotNull(dashcardId),
        parameters,
      };
    }
    if (resourceType === "document-card" && documentUuid) {
      return {
        ...exportOptions,
        resourceType,
        accessedVia,
        cardId,
        documentUuid,
        parameters,
      };
    }
    if (resourceType === "question" && uuid) {
      return { ...exportOptions, resourceType, accessedVia, uuid, parameters };
    }
  }

  // Static embeds use special endpoints that use signed tokens instead of ids
  if (accessedVia === "static-embed") {
    if (resourceType === "dashcard") {
      return {
        ...exportOptions,
        resourceType,
        accessedVia,
        token: checkNotNull(token),
        cardId,
        dashcardId: checkNotNull(dashcardId),
        parameterValues: params,
      };
    }
    if (resourceType === "question" && token) {
      return {
        ...exportOptions,
        resourceType,
        accessedVia,
        token,
        parameterValues: params,
      };
    }
  }

  // Normal endpoints used by internal, interactive embedding, and SDK
  if (resourceType === "dashcard") {
    return {
      ...exportOptions,
      resourceType,
      accessedVia: "internal",
      cardId,
      dashboardId: checkNotNull(dashboardId),
      dashcardId: checkNotNull(dashcardId),
      parameters,
    };
  }

  if (resourceType === "document-card" && documentId) {
    return {
      ...exportOptions,
      resourceType,
      accessedVia: "internal",
      cardId,
      documentId,
      parameters,
    };
  }

  if (resourceType === "question") {
    return {
      ...exportOptions,
      resourceType,
      accessedVia: "internal",
      cardId,
      parameters,
    };
  }

  if (resourceType === "ad-hoc-question") {
    return {
      ...exportOptions,
      resourceType,
      query: result.json_query,
      visualizationSettings: visualizationSettings ?? {},
    };
  }

  throw new Error(
    `Unsupported download type: ${resourceType} via ${accessedVia}`,
  );
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
