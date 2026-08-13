import L from "leaflet";
import type { ContextType } from "react";

import { api } from "metabase/api/client";
import { EmbeddingEntityContext } from "metabase/embedding/context";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isWithinIframe } from "metabase/utils/iframe";
import type { DashboardId } from "metabase-types/api";

import { getTileUrl } from "../lib/map";

import { LeafletMap, type LeafletMapProps } from "./LeafletMap";

type TileCoord = {
  x: number | string;
  y: number | string;
};

type TileImage = HTMLImageElement & {
  _fetchCtrl?: AbortController;
};

type TileLayerWithInternals = L.TileLayer & {
  _url?: string;
  _tileOnError?: (
    done: L.DoneCallback | undefined,
    tile: HTMLElement,
    error: unknown,
  ) => void;
  createTile: (coords: L.Coords, done?: L.DoneCallback) => HTMLElement;
};

function isTileLayerWithInternals(
  tileLayer: L.TileLayer,
): tileLayer is TileLayerWithInternals {
  return (
    "_url" in tileLayer &&
    "_tileOnError" in tileLayer &&
    "createTile" in tileLayer
  );
}

function isTileImage(tile: unknown): tile is TileImage {
  return tile instanceof HTMLImageElement;
}

interface LeafletTilePinMapProps extends LeafletMapProps {
  dashboard?: {
    id?: DashboardId | null;
  } | null;
  dashcard?: {
    id?: number | null;
  } | null;
}

// Narrow `this.context` to the EmbeddingEntityContext value type via
// declaration merging. We can't use a `declare context: …` class field here
// because babel's `@babel/preset-typescript` doesn't enable
// `allowDeclareFields` and would treat it as a syntax error in the SDK bundle
// build.
export interface LeafletTilePinMap {
  context: ContextType<typeof EmbeddingEntityContext>;
}

export class LeafletTilePinMap extends LeafletMap<LeafletTilePinMapProps> {
  static contextType = EmbeddingEntityContext;

  pinTileLayer: L.TileLayer | null = null;

  componentDidMount() {
    super.componentDidMount();

    if (!this.map) {
      return;
    }

    this.pinTileLayer = L.tileLayer("", {}).addTo(this.map);

    // Override only for SDK and not for cases when SDK is used under the hood for other embed types (Embed JS)
    if (isEmbeddingSdk() && !isWithinIframe()) {
      this._overrideCreateTileToUseFetch(this.pinTileLayer);
    }

    this.componentDidUpdate(this.props);
  }

  componentDidUpdate(prevProps: LeafletTilePinMapProps) {
    super.componentDidUpdate(prevProps);

    try {
      const { pinTileLayer } = this;
      if (!pinTileLayer || !isTileLayerWithInternals(pinTileLayer)) {
        return;
      }

      const newUrl = this._getTileUrl({ x: "{x}", y: "{y}" }, "{z}");
      const currentUrl = pinTileLayer._url;
      const nextUrl = newUrl ?? "";
      if (nextUrl !== currentUrl) {
        pinTileLayer.setUrl(nextUrl);
      }
    } catch (err: unknown) {
      this.props.onRenderError(
        err instanceof Error ? err.message : (err ?? undefined),
      );
    }
  }

  _getTileUrl = (
    coord: TileCoord,
    zoom: string | number,
  ): string | undefined => {
    const [datasetResult] = this.props.series;
    if (!datasetResult) {
      return undefined;
    }

    const { card, data } = datasetResult;
    const cardId = card.id;

    const { latitudeIndex, longitudeIndex } = this._getLatLonIndexes();
    const latitudeField = data.cols[latitudeIndex];
    const longitudeField = data.cols[longitudeIndex];

    if (!latitudeField || !longitudeField) {
      return undefined;
    }

    const latFieldParam = JSON.stringify(latitudeField.field_ref);
    const lonFieldParam = JSON.stringify(longitudeField.field_ref);

    const { dashboard, dashcard } = this.props;
    // EmbeddingEntityContext is only available under embedding environment
    const { uuid, token } = this.context ?? {};

    return getTileUrl({
      cardId,
      dashboardId: dashboard?.id ?? undefined,
      dashcardId: dashcard?.id ?? undefined,
      zoom,
      coord,
      latField: latFieldParam,
      lonField: lonFieldParam,
      datasetQuery: card?.dataset_query,
      uuid: uuid ?? undefined,
      token: token ?? undefined,
      parameters: datasetResult.json_query?.parameters ?? [],
    });
  };

  /**
   * Overrides TileLayer.createTile to use fetch instead of setting img.src directly.
   * It's needed to be able to set custom headers (e.g. Authorization header for embedding).
   */
  _overrideCreateTileToUseFetch = (tileLayerInstance: L.TileLayer) => {
    const onTileUnload = (event: L.TileEvent) => {
      const { tile } = event;

      try {
        if (isTileImage(tile)) {
          tile._fetchCtrl?.abort();
        }
      } catch {}
    };

    tileLayerInstance.on("tileunload", onTileUnload);

    if (!isTileLayerWithInternals(tileLayerInstance)) {
      return;
    }

    tileLayerInstance.createTile = function (
      coords: L.Coords,
      done?: L.DoneCallback,
    ): HTMLElement {
      const tileUrl = this.getTileUrl(coords);
      const tile: TileImage = document.createElement("img");
      tile.alt = "";

      if (!tileUrl) {
        done?.(undefined, tile);
        return tile;
      }

      const controller = new AbortController();
      tile._fetchCtrl = controller;

      loadImage(tile, tileUrl, controller.signal)
        .then(() => {
          if (controller.signal.aborted) {
            return;
          }
          done?.(undefined, tile);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          try {
            this._tileOnError?.(done, tile, error);
          } catch {
            done?.(
              error instanceof Error ? error : new Error(String(error)),
              tile,
            );
          }
        });

      return tile;
    };
  };
}

async function loadImage(
  img: HTMLImageElement,
  url: string,
  signal: AbortSignal,
) {
  const response = await api.request({
    method: "GET",
    url,
    signal,
    rawResponse: true,
    retry: true,
  });
  const blob = await response.blob();
  const src = await readAsDataURL(blob);

  img.src = src;
  // img.decode waits for the image to be loaded and throws if it fails
  await img.decode();
}

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Cannot read tile"));
      }
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Cannot read tile"));
    };

    reader.readAsDataURL(blob);
  });
}
