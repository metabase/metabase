import L from "leaflet";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { GET } from "metabase/lib/api";
import { isWithinIframe } from "metabase/lib/dom";

import { getTileUrl } from "../lib/map";

import LeafletMap from "./LeafletMap";

// When base-type is present in the field ref (usually due to a breakout) the call to get
// tiles will fail because its value of type/Float (for example) gets encoded as test%2FFloat
// Jetty URL decodes this to `/` before attempting to parse the URI which results in Jetty
// reporting an ambiguous path identifier.
//
// There may be other problematic field ref options, but this one causes the immediate bug
const stringifyFieldRef = ([type, key, opts]) => {
  const { ["base-type"]: _, ...restOpts } = !opts ? {} : opts;
  return encodeURIComponent(JSON.stringify([type, key, restOpts]));
};

export default class LeafletTilePinMap extends LeafletMap {
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

    const latFieldParam = stringifyFieldRef(latitudeField.field_ref);
    const lonFieldParam = stringifyFieldRef(longitudeField.field_ref);

    const { dashboard, dashcard, uuid, token } = this.props;

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
