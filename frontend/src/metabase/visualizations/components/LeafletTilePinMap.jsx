import L from "leaflet";

import { getTileUrl } from "../lib/map";

import LeafletMap from "./LeafletMap";

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
      console.error(err);
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

    const latFieldParam =
      latitudeField.id || encodeURIComponent(latitudeField.name);
    const lonFieldParam =
      longitudeField.id || encodeURIComponent(longitudeField.name);

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
