import React, { Component, PropTypes } from "react";

import Utils from "metabase/lib/utils";

import Select, { Option } from "metabase/components/Select.jsx";
import Confirm from "metabase/components/Confirm.jsx";

import cx from "classnames";
import fetch from 'isomorphic-fetch';


export default class SettingsCustomMaps extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            map: null,
            originalMap: null,
            geoJson: null
        };
    }

    static propTypes = {};
    static defaultProps = {};

    _saveMap = async (id, map) => {
        const { elements } = this.props;

        const value = {};
        for (const [existingId, existingMap] of Object.entries(elements[0].value)) {
            if (!existingMap.builtin) {
                value[existingId] = { ...existingMap, id: undefined };
            }
        }
        if (map) {
            value[id] = { ...map, id: undefined };
        } else {
            delete value[id];
        }

        await fetch("/api/setting/custom-geojson", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value }),
            credentials: "same-origin",
        });

        await this.props.reloadSettings();
    }

    _save = async () => {
        const { map } = this.state;
        await this._saveMap(map.id, map);
        this.setState({ map: null, originalMap: null });
    }

    _cancel = async () => {
        const { map, originalMap } = this.state;
        await this._saveMap(map.id, originalMap);
        this.setState({ map: null, originalMap: null });
    }

    _delete = async (map) => {
        await this._saveMap(map.id, null);
    }

    // This is a bit of a hack, but the /api/geojson endpoint only works if the map is saved in the custom-geojson setting
    _loadGeoJson = async () => {
        try {
            const { map } = this.state;
            this.setState({ geoJson: null });
            await this._saveMap(map.id, map);
            let geoJsonResponse = await fetch("/api/geojson/" + map.id, {
                credentials: "same-origin"
            });
            this.setState({ geoJson: await geoJsonResponse.json() });
        } catch (e) {
            console.warn("map fetch failed", e)
        }
    }

    render() {
        const { elements } = this.props;

        if (this.state.map) {
            return (
                <EditMap
                    map={this.state.map}
                    originalMap={this.state.originalMap}
                    onMapChange={(map) => this.setState({ map })}
                    geoJson={this.state.geoJson}
                    onLoadGeoJson={this._loadGeoJson}
                    onCancel={this._cancel}
                    onSave={this._save}
                />
            )
        }

        return (
            <ListMaps
                maps={Object.entries(elements[0].value).map(([key, value]) => ({ ...value, id: key }))}
                onEditMap={(map) => this.setState({
                    map: {
                        ...map
                    },
                    originalMap: map,
                    geoJson: null
                }, this._loadGeoJson)}
                onAddMap={() => this.setState({
                    map: {
                        id: Utils.uuid(),
                        name: "",
                        url: "",
                        region_key: null,
                        region_name: null
                    },
                    originalMap: null,
                    geoJson: null
                })}
                onDeleteMap={this._delete}
            />
        );
    }
}

const ListMaps = ({ maps, onEditMap, onAddMap, onDeleteMap }) =>
    <div>
        <h2>Custom Maps</h2>
        <p className="text-grey-4 flex align-center">
            <span>Add your own GeoJSON files</span>
            <button className="Button Button--primary ml1" onClick={onAddMap}>Add a map</button>
        </p>
        <table>
            {maps.filter(map => !map.builtin).map(map =>
                <tr key={map.id}>
                    <td>
                        <a className="cursor-pointer" onClick={() => onEditMap(map)}>{map.name}</a>
                    </td>
                    <td>
                        {map.url}
                    </td>
                    <td>
                        <Confirm action={() => onDeleteMap(map)} title="Delete custom map">
                            <button className="Button Button--small Button--danger">Remove</button>
                        </Confirm>
                    </td>
                </tr>
            )}
        </table>
    </div>

const GeoJsonPropertySelect = ({ value, onChange, geoJson }) => {
    let options = {};
    for (const feature of geoJson.features) {
        for (const property in feature.properties) {
            options[property] = options[property] || [];
            options[property].push(feature.properties[property]);
        }
    }
    console.log(options)

    return (
        <Select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Select…"
        >
            {Object.entries(options).map(([name, values]) =>
                <Option key={name} value={name}>
                    <div>
                        <div>{name}</div>
                        <div className="" style={{ maxWidth: 250, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {values.join(", ")}
                        </div>
                    </div>
                </Option>
            )}
        </Select>
    )
}

const EditMap = ({ map, onMapChange, originalMap, geoJson, onLoadGeoJson, onCancel, onSave }) =>
    <ul>
        <h2>{ !originalMap ? "Add a new map" : "Edit map" }</h2>
        <li className="m2 mb4">
            <div className="text-grey-4 text-bold text-uppercase pb1">Map Name</div>
            <div className="flex">
                <input
                    type="text"
                    className="SettingsInput AdminInput bordered rounded h3"
                    placeholder="e.g. United Kingdom, Brazil, Mars"
                    value={map.name}
                    onChange={(e) => onMapChange({ ...map, "name": e.target.value })}
                />
            </div>
        </li>
        <li className="m2 mb4">
            <div className="text-grey-4 text-bold text-uppercase pb1">GeoJSON URL</div>
            <div className="flex">
                <input
                    type="text"
                    className="SettingsInput AdminInput bordered rounded h3"
                    placeholder="Like https://my-mb-server.com/maps/my-map.json"
                    value={map.url}
                    onChange={(e) => onMapChange({ ...map, "url": e.target.value })}
                />
                <button className={cx("Button ml1", { "Button--primary" : !geoJson })} onClick={onLoadGeoJson}>{geoJson ? "Refresh" : "Load"}</button>
            </div>
        </li>
        { geoJson &&
            <li className="m2 mb4">
                <div className="text-grey-4 text-bold text-uppercase pb1">Name Property</div>
                <GeoJsonPropertySelect
                    value={map.region_name}
                    onChange={(value) => onMapChange({ ...map, "region_name": value })}
                    geoJson={geoJson}
                />
            </li>
        }
        { geoJson &&
            <li className="m2 mb4">
                <div className="text-grey-4 text-bold text-uppercase pb1">Region Property</div>
                <GeoJsonPropertySelect
                    value={map.region_key}
                    onChange={(value) => onMapChange({ ...map, "region_key": value })}
                    geoJson={geoJson}
                />
            </li>
        }
        <li className="m2 mb4">
            <button className={cx("Button Button--borderless")} onClick={onCancel}>Cancel</button>
            <button className={cx("Button Button--primary ml1", { "disabled" : !map.name || !map.url || !map.region_name || !map.region_key })} onClick={onSave}>
                {originalMap ? "Save map" : "Add map"}
            </button>
        </li>
    </ul>
