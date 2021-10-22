import L from "leaflet";

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
        card: { dataset_query },
        data: { cols },
      },
    ] = this.props.series;

    const { latitudeIndex, longitudeIndex } = this._getLatLonIndexes();
    const latitudeField = cols[latitudeIndex];
    const longitudeField = cols[longitudeIndex];

    if (!latitudeField || !longitudeField) {
      return;
    }

    return (
      "api/tiles/" +
      zoom +
      "/" +
      coord.x +
      "/" +
      coord.y +
      "/" +
      latitudeField.id +
      "/" +
      longitudeField.id +
      "/" +
      latitudeIndex +
      "/" +
      longitudeIndex +
      "/" +
      "?query=" +
      encodeURIComponent(JSON.stringify(dataset_query))
    );
  };
}
