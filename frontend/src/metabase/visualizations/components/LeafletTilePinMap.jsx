import L from "leaflet";

import { getTileUrl } from "../lib/map";

import LeafletMap from "./LeafletMap";

// When base-type is present in the field ref (usually due to a breakout) the call to get
// tiles will fail because its value of text/Float (for example) gets encoded as test%2FFloat
// Jetty URL decodes this to `/` before attempting to parse the URI which results in Jetty
// reporting an ambiguous path identifier.
//
// There may be other problematic field ref options, but this one causes the immediate bug
const stringifyFieldRef = ([type, key, { ["base-type"]: _, ...restOpts }]) =>
  encodeURIComponent(JSON.stringify([type, key, restOpts]));

export default class LeafletTilePinMap extends LeafletMap {
  componentDidMount() {
    super.componentDidMount();

    this.pinTileLayer = L.tileLayer("", {}).addTo(this.map);
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
}
