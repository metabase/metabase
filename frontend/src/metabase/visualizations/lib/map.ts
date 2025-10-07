import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import type { DashboardId, Dataset, JsonQuery } from "metabase-types/api";

interface TileCoordinate {
  x: number | string;
  y: number | string;
}

interface TileUrlParams {
  cardId?: number;
  dashboardId?: DashboardId;
  dashcardId?: number;
  zoom: string | number;
  coord: TileCoordinate;
  latField: string;
  lonField: string;
  datasetQuery?: JsonQuery;
  uuid?: string;
  token?: string;
  datasetResult?: Dataset;
}

export function getTileUrl(params: TileUrlParams): string {
  const {
    cardId,
    dashboardId,
    dashcardId,
    zoom,
    coord,
    latField,
    lonField,
    datasetQuery,
    uuid,
    token,
    datasetResult,
  } = params;

  const parameters = datasetResult?.json_query?.parameters ?? [];

  const isDashboard = dashboardId && dashcardId && cardId;

  if (isDashboard) {
    // isAutoDashboard
    if (typeof dashboardId === "string" && dashboardId.startsWith("/auto")) {
      return adhocQueryTileUrl(zoom, coord, latField, lonField, datasetQuery);
    }

    if (
      typeof dashboardId === "string" &&
      !isUuid(dashboardId) && // public dashboard
      !isJWT(dashboardId) // embedded dashboard
    ) {
      throw new Error("dashboardId must be an int, an uuid or a jwt");
    }

    const isPublicDashboard = uuid;

    if (isPublicDashboard) {
      return publicDashboardTileUrl(
        uuid,
        dashcardId,
        cardId,
        zoom,
        coord,
        latField,
        lonField,
        parameters,
      );
    }

    const isEmbedDashboard = token;
    if (isEmbedDashboard) {
      return embedDashboardTileUrl(
        token,
        dashcardId,
        cardId,
        zoom,
        coord,
        latField,
        lonField,
        parameters,
      );
    }

    return dashboardTileUrl(
      dashboardId,
      dashcardId,
      cardId,
      zoom,
      coord,
      latField,
      lonField,
      parameters,
    );
  }

  if (cardId) {
    const isPublicQuestion = uuid;

    if (isPublicQuestion) {
      return publicCardTileUrl(
        uuid,
        zoom,
        coord,
        latField,
        lonField,
        parameters,
      );
    }

    const isEmbedQuestion = token;
    if (isEmbedQuestion) {
      return embedCardTileUrl(
        token,
        zoom,
        coord,
        latField,
        lonField,
        parameters,
      );
    }

    return savedQuestionTileUrl(
      cardId,
      zoom,
      coord,
      latField,
      lonField,
      parameters,
    );
  }

  if (datasetQuery) {
    return adhocQueryTileUrl(zoom, coord, latField, lonField, datasetQuery);
  }

  throw new Error("Invalid tile URL parameters");
}

function adhocQueryTileUrl(
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  datasetQuery: any,
): string {
  const params = new URLSearchParams({
    query: JSON.stringify(datasetQuery),
    latField,
    lonField,
  });
  return `/api/tiles/${zoom}/${coord.x}/${coord.y}?${params.toString()}`;
}

function savedQuestionTileUrl(
  cardId: number,
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  parameters?: unknown[],
): string {
  const params = new URLSearchParams({
    latField,
    lonField,
  });
  if (parameters && parameters.length > 0) {
    params.set("parameters", JSON.stringify(parameters));
  }
  return `/api/tiles/${cardId}/${zoom}/${coord.x}/${coord.y}?${params.toString()}`;
}

function dashboardTileUrl(
  dashboardId: DashboardId,
  dashcardId: number,
  cardId: number,
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  parameters?: unknown[],
): string {
  const params = new URLSearchParams({
    latField,
    lonField,
  });
  if (parameters && parameters.length > 0) {
    params.set("parameters", JSON.stringify(parameters));
  }
  return `/api/tiles/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/${zoom}/${coord.x}/${coord.y}?${params.toString()}`;
}

function publicCardTileUrl(
  token: string,
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  parameters?: unknown[],
): string {
  const params = new URLSearchParams({
    latField,
    lonField,
  });
  if (parameters && parameters.length > 0) {
    params.set("parameters", JSON.stringify(parameters));
  }
  return `/api/public/tiles/card/${token}/${zoom}/${coord.x}/${coord.y}?${params.toString()}`;
}

function publicDashboardTileUrl(
  token: string,
  dashcardId: number,
  cardId: number,
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  parameters?: unknown[],
): string {
  const params = new URLSearchParams({
    latField,
    lonField,
  });
  if (parameters && parameters.length > 0) {
    params.set("parameters", JSON.stringify(parameters));
  }
  return `/api/public/tiles/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${zoom}/${coord.x}/${coord.y}?${params.toString()}`;
}

function embedCardTileUrl(
  token: string,
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  parameters?: unknown[],
): string {
  const params = new URLSearchParams({
    latField,
    lonField,
  });
  if (parameters && parameters.length > 0) {
    params.set("parameters", JSON.stringify(parameters));
  }
  return `/api/embed/tiles/card/${token}/${zoom}/${coord.x}/${coord.y}?${params.toString()}`;
}

function embedDashboardTileUrl(
  token: string,
  dashcardId: number,
  cardId: number,
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  parameters?: unknown[],
): string {
  const params = new URLSearchParams({
    latField,
    lonField,
  });
  if (parameters && parameters.length > 0) {
    params.set("parameters", JSON.stringify(parameters));
  }
  const endpoint = IS_EMBED_PREVIEW ? "preview_embed" : "embed";
  return `/api/${endpoint}/tiles/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${zoom}/${coord.x}/${coord.y}?${params.toString()}`;
}
