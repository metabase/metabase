import L from "leaflet";

import { EmbeddingEntityContext } from "metabase/embedding/context";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { GET } from "metabase/lib/api";
import { isWithinIframe } from "metabase/lib/dom";

import { getTileUrl } from "../lib/map";

import { LeafletMap } from "./LeafletMap";

export class LeafletTilePinMap extends LeafletMap {
  static contextType = EmbeddingEntityContext;

  componentDidMount() {
    super.componentDidMount();

    this.pinTileLayer = L.tileLayer("", {}).addTo(this.map);

    // Override only for SDK and not for cases when SDK is used under the hood for other embed types (Embed JS)
    if (isEmbeddingSdk() && !isWithinIframe()) {
      this._overrideCreateTileToUseFetch(this.pinTileLayer);
    }

    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    super.componentDidUpdate(prevProps, prevState);

    try {
      const { pinTileLayer } = this;
      const newUrl = this._getTileUrl({ x: "{x}", y: "{y}" }, "{z}");
      if (newUrl !== pinTileLayer._url) {
        pinTileLayer.setUrl(newUrl);
      }
    } catch (err) {
      this.props.onRenderError(err.message || err);
    }
  }

  _getTileUrl = (coord, zoom) => {
    const [
      {
        card: { dataset_query, id },
        data,
      },
    ] = this.props.series;

    const { latitudeIndex, longitudeIndex } = this._getLatLonIndexes();
    const latitudeField = data.cols[latitudeIndex];
    const longitudeField = data.cols[longitudeIndex];

    if (!latitudeField || !longitudeField) {
      return;
    }

    const latFieldParam = JSON.stringify(latitudeField.field_ref);
    const lonFieldParam = JSON.stringify(longitudeField.field_ref);

    const { dashboard, dashcard } = this.props;
    // EmbeddingEntityContext is only available under embedding environment
    const { uuid, token } = this.context ?? {};

    return getTileUrl({
      cardId: id,
      dashboardId: dashboard?.id,
      dashcardId: dashcard?.id,
      zoom,
      coord,
      latField: latFieldParam,
      lonField: lonFieldParam,
      datasetQuery: dataset_query,
      uuid,
      token,
      datasetResult: this.props.series[0],
    });
  };

  /**
   * Overrides TileLayer.createTile to use fetch instead of setting img.src directly.
   * It's needed to be able to set custom headers (e.g. Authorization header for embedding).
   */
  _overrideCreateTileToUseFetch = (tileLayerInstance = {}) => {
    const onTileUnload = (event) => {
      const tile = event.tile;

      if (!tile) {
        return;
      }

      try {
        tile._fetchCtrl?.abort();
      } catch {}
    };

    tileLayerInstance.on("tileabort", onTileUnload);
    tileLayerInstance.on("tileunload", onTileUnload);

    tileLayerInstance.createTile = function (coords, done) {
      const tileUrl = this.getTileUrl(coords);

      const tile = document.createElement("img");
      tile.alt = "";

      if (!tileUrl) {
        done?.(null, tile);

        return tile;
      }

      const controller = new AbortController();
      tile._fetchCtrl = controller;

      GET(tileUrl, {
        fetch: true,
        signal: controller.signal,
        transformResponse: ({ response }) => response,
      })()
        .then((response) => response.blob())
        .then(async (blob) => {
          const reader = new FileReader();

          reader.onload = () => {
            tile.src = reader.result;
          };

          reader.readAsDataURL(blob);
          done?.(null, tile);
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            return;
          }

          try {
            this._tileOnError(done, tile, error);
          } catch {
            done?.(error, tile);
          }
        });

      return tile;
    };
  };
}
