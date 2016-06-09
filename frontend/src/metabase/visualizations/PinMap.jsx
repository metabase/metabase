/*global google*/

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import { getSettingsForVisualization, setLatitudeAndLongitude, setCategory } from "metabase/lib/visualization_settings";
import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";

import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";

import _ from "underscore";
import cx from "classnames";
import L from "leaflet";
import tinycolor from "tinycolor2";
import ColorHash from "color-hash";
const ch = new ColorHash();

export default class PinMap extends Component {
    static displayName = "Pin Map";
    static identifier = "pin_map";
    static iconName = "pinmap";

    static isSensible(cols, rows) {
        return hasLatitudeAndLongitudeColumns(cols);
    }

    static checkRenderable(cols, rows) {
        if (!hasLatitudeAndLongitudeColumns(cols)) { throw new LatitudeLongitudeError(); }
    }

    constructor(props, context) {
        super(props, context);
        this.state = {
            lat: null,
            lon: null,
            zoom: null
        };
        _.bindAll(this, "onMapZoomChange", "onMapCenterChange", "updateSettings");
    }

    updateSettings() {
        if (this.state.lat != null) {
            this.props.onUpdateVisualizationSetting(["map", "center_latitude"], this.state.lat);
        }
        if (this.state.lon != null) {
            this.props.onUpdateVisualizationSetting(["map", "center_longitude"], this.state.lon);
        }
        if (this.state.zoom != null) {
            this.props.onUpdateVisualizationSetting(["map", "zoom"], this.state.zoom);
        }
        this.setState({ lat: null, lon: null, zoom: null });
    }

    onMapCenterChange(lat, lon) {
        this.setState({ lat, lon });
    }

    onMapZoomChange(zoom) {
        this.setState({ zoom });
    }

    averageCoordinate(coordinates) {
        return _.reduce(coordinates, (memo, num) => {return memo + num}, 0) / coordinates.length;
    }

    genMarker(color){
        return L.VectorMarkers.icon({
            markerColor: color
        });
    }

    genColorCode(string){
        return tinycolor(ch.hex(string)).monochromatic()[3].toHexString();
    }

    componentDidMount() {
        try {
            let element = ReactDOM.findDOMNode(this.refs.map);

            let { card, data } = this.props.series[0];

            let settings = card.visualization_settings;
            settings = getSettingsForVisualization(settings, "pin_map");
            settings = setLatitudeAndLongitude(settings, data.cols);
            settings = setCategory(settings, data.cols);

            let latColIndex = settings.map.latitude_dataset_col_index;
            let lonColIndex = settings.map.longitude_dataset_col_index;
            let catColIndex = settings.map.category_dataset_col_index;
            let catColorMap;
            if (catColIndex) {
              let cats = _.union(_.pluck(data.rows, catColIndex))
              catColorMap = _.map(cats, (cat, index) => {
                return {'name': cat, 'color': this.genColorCode(cat), 'id': index}
              })
            }

            let center_latitude = settings.map.center_latitude;
            let center_longitude = settings.map.center_longitude;
            if (!center_latitude || !center_longitude){
              center_latitude = this.averageCoordinate(_.pluck(data.rows, latColIndex));
              center_longitude = this.averageCoordinate(_.pluck(data.rows, lonColIndex));
            }

            let map = L.map(element).setView([center_latitude, center_longitude], settings.map.zoom);

            L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
              attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',
              maxZoom: 18,
            }).addTo(map);

            let pruneCluster = new PruneClusterForLeaflet();
            let pi2 = pi2 = Math.PI * 2;
            pruneCluster.BuildLeafletClusterIcon = function(cluster) {
              L.Icon.MarkerCluster = L.Icon.extend({
                options: {
                  iconSize: new L.Point(44, 44),
                  className: 'prunecluster leaflet-markercluster-icon'
                },

                createIcon: function () {
                  var e = document.createElement('canvas');
                  this._setIconStyles(e, 'icon');
                  var s = this.options.iconSize;
                  e.width = s.x;
                  e.height = s.y;
                  this.draw(e.getContext('2d'), s.x, s.y);
                  return e;
                },

                createShadow: function () {
                  return null;
                },

                draw: function(canvas, width, height) {
                  var lol = 0;
                  var start = 0;
                  for (var i = 0, l = catColorMap.length; i < l; ++i) {
                      var size = this.stats[i] / this.population;
                      if (size > 0) {
                          canvas.beginPath();
                          canvas.moveTo(22, 22);
                          canvas.fillStyle = _.findWhere(catColorMap, {id: i}).color;
                          var from = start + 0.14,
                              to = start + size * pi2;
                          if (to < from) {
                              from = start;
                          }
                          canvas.arc(22,22,22, from, to);
                          start = start + size*pi2;
                          canvas.lineTo(22,22);
                          canvas.fill();
                          canvas.closePath();
                      }
                  }
                  canvas.beginPath();
                  canvas.fillStyle = 'white';
                  canvas.arc(22, 22, 18, 0, Math.PI*2);
                  canvas.fill();
                  canvas.closePath();
                  canvas.fillStyle = '#555';
                  canvas.textAlign = 'center';
                  canvas.textBaseline = 'middle';
                  canvas.font = 'bold 12px sans-serif';
                  canvas.fillText(this.population, 22, 22, 40);
                }
              });
              let e = new L.Icon.MarkerCluster();
              e.stats = cluster.stats;
              e.population = cluster.population;
              return e;
            };
            for (let row of data.rows) {
              let tooltipElement = document.createElement("div");
              ReactDOM.render(<ObjectDetailTooltip row={row} cols={data.cols} />, tooltipElement);

              let marker = new PruneCluster.Marker(row[latColIndex], row[lonColIndex]);
              if(catColIndex){
                let cat = row[catColIndex]
                let color = _.findWhere(catColorMap, {name: cat}).color
                marker.data.icon = this.genMarker(color);
                marker.category = cat;
              } else {
                marker.data.icon = this.genMarker('#3090e9');
              }
              marker.data.popup = tooltipElement;
              pruneCluster.RegisterMarker(marker);
            }

            map.addLayer(pruneCluster);

            map.on('moveend', () => {
              let center = map.getCenter();
              this.onMapCenterChange(center.lat, center.lng);
            });

            map.on('zoomend', () => {
              this.onMapZoomChange(map.getZoom());
            })

        } catch (err) {
            console.error(err);
            this.props.onRenderError(err.message || err);
        }
    }

    render() {
        const { className, isEditing } = this.props;
        const { lat, lon, zoom } = this.state;
        const disableUpdateButton = lat == null && lon == null && zoom == null;
        return (
            <div className={className + " PinMap relative"} onMouseDownCapture={(e) =>e.stopPropagation() /* prevent dragging */}>
                <div className="absolute top left bottom right" ref="map"></div>
                { isEditing ?
                    <div className={cx("PinMapUpdateButton Button Button--small absolute top right m1", { "PinMapUpdateButton--disabled": disableUpdateButton })} onClick={this.updateSettings}>
                        Save as default view
                    </div>
                : null }
            </div>
        );
    }
}

const ObjectDetailTooltip = ({ row, cols }) =>
    <table>
        <tbody>
            { cols.map((col, index) =>
                <tr>
                    <td>{col.display_name}</td>
                    <td>{row[index]}</td>
                </tr>
            )}
        </tbody>
    </table>
