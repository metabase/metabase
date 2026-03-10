import L from "leaflet";
import type { ContextType } from "react";

import { EmbeddingEntityContext } from "metabase/embedding/context";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { GET } from "metabase/lib/api";
import { isWithinIframe } from "metabase/lib/dom";
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

export class LeafletTilePinMap extends LeafletMap<LeafletTilePinMapProps> {
  static contextType = EmbeddingEntityContext;
  // @ts-expect-error - see: https://linear.app/metabase/issue/GDGT-1891/migrate-babel-config-to-allowdeclarefields
  context!: ContextType<typeof EmbeddingEntityContext>;

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

      (
        GET(tileUrl, {
          fetch: true,
          signal: controller.signal,
          transformResponse: ({ response }: { response: Response }) => response,
          // TODO: Remove  casting after api.js is migrated to TS
        })() as Promise<Response>
      )
        .then((response) => response.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              tile.src = reader.result;
            }
          };

          reader.readAsDataURL(blob);
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
