import type { Dataset, JsonQuery } from "metabase-types/api";

interface TileCoordinate {
  x: number | string;
  y: number | string;
}

interface TileUrlParams {
  cardId?: number;
  dashboardId?: number;
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
  return `/api/tiles/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}?query=${encodeURIComponent(
    JSON.stringify(datasetQuery),
  )}`;
}

function savedQuestionTileUrl(
  cardId: number,
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  parameters?: unknown[],
): string {
  let url = `/api/tiles/${cardId}/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`;
  if (parameters && parameters.length > 0) {
    url += `?parameters=${encodeURIComponent(JSON.stringify(parameters))}`;
  }
  return url;
}

function dashboardTileUrl(
  dashboardId: number,
  dashcardId: number,
  cardId: number,
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  parameters?: unknown[],
): string {
  let url = `/api/tiles/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`;
  if (parameters && parameters.length > 0) {
    url += `?parameters=${encodeURIComponent(JSON.stringify(parameters))}`;
  }
  return url;
}

function publicCardTileUrl(
  token: string,
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  parameters?: unknown[],
): string {
  let url = `/api/public/tiles/card/${token}/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`;
  if (parameters && parameters.length > 0) {
    url += `?parameters=${encodeURIComponent(JSON.stringify(parameters))}`;
  }
  return url;
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
  let url = `/api/public/tiles/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`;
  if (parameters && parameters.length > 0) {
    url += `?parameters=${encodeURIComponent(JSON.stringify(parameters))}`;
  }
  return url;
}

function embedCardTileUrl(
  token: string,
  zoom: string | number,
  coord: TileCoordinate,
  latField: string,
  lonField: string,
  parameters?: unknown[],
): string {
  let url = `/api/embed/tiles/card/${token}/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`;
  if (parameters && parameters.length > 0) {
    url += `?parameters=${encodeURIComponent(JSON.stringify(parameters))}`;
  }
  return url;
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
  let url = `/api/embed/tiles/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${zoom}/${coord.x}/${coord.y}/${latField}/${lonField}`;
  if (parameters && parameters.length > 0) {
    url += `?parameters=${encodeURIComponent(JSON.stringify(parameters))}`;
  }
  return url;
}
