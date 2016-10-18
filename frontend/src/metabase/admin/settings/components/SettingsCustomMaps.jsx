import React, { Component, PropTypes } from "react";

import Utils from "metabase/lib/utils";

import Select, { Option } from "metabase/components/Select.jsx";
import Confirm from "metabase/components/Confirm.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import cx from "classnames";
import fetch from 'isomorphic-fetch';


export default class SettingsCustomMaps extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            map: null,
            originalMap: null,
            geoJson: null,
            geoJsonLoading: false,
            geoJsonError: null,
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
            this.setState({
                geoJson: null,
                geoJsonLoading: true,
                geoJsonError: null,
            });
            await this._saveMap(map.id, map);
            let geoJsonResponse = await fetch("/api/geojson/" + map.id, {
                credentials: "same-origin"
            });
            this.setState({
                geoJson: await geoJsonResponse.json(),
                geoJsonLoading: false,
                geoJsonError: null,
            });
        } catch (e) {
            this.setState({
                geoJson: null,
                geoJsonLoading: false,
                geoJsonError: e,
            });
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
                    geoJsonLoading={this.state.geoJsonLoading}
                    geoJsonError={this.state.geoJsonError}
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
                    geoJson: null,
                    geoJsonLoading: false,
                    geoJsonError: null,
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
                    geoJson: null,
                    geoJsonLoading: false,
                    geoJsonError: null,
                })}
                onDeleteMap={this._delete}
            />
        );
    }
}

const ListMaps = ({ maps, onEditMap, onAddMap, onDeleteMap }) =>
    <div>
        <section className="p2 clearfix">
            <div className="inline-block">
                <h2 className="PageTitle mb1">Custom Maps</h2>
                <span>Add your own GeoJSON files</span>
            </div>
            <button className="Button Button--primary float-right" onClick={onAddMap}>Add a map</button>
        </section>
        <section>
            <table className="ContentTable">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>URL</th>
                    </tr>
                </thead>
                <tbody>
                {maps.filter(map => !map.builtin).map(map =>
                    <tr key={map.id}>
                        <td className="cursor-pointer" onClick={() => onEditMap(map)}>
                            {map.name}
                        </td>
                        <td className="cursor-pointer" onClick={() => onEditMap(map)}>
                            <Ellipsified style={{ maxWidth: 600 }}>{map.url}</Ellipsified>
                        </td>
                        <td className="Table-actions">
                            <Confirm action={() => onDeleteMap(map)} title="Delete custom map">
                                <button className="Button Button--danger">Remove</button>
                            </Confirm>
                        </td>
                    </tr>
                )}
                </tbody>
            </table>
        </section>
    </div>

const GeoJsonPropertySelect = ({ value, onChange, geoJson }) => {
    let options = {};
    for (const feature of geoJson.features) {
        for (const property in feature.properties) {
            options[property] = options[property] || [];
            options[property].push(feature.properties[property]);
        }
    }

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
                        <div className="mt1 h6" style={{ maxWidth: 250, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            Sample values: {values.join(", ")}
                        </div>
                    </div>
                </Option>
            )}
        </Select>
    )
}

const SettingContainer = ({ name, description, className="py1", children }) =>
    <div className={className}>
        { name && <div className="text-grey-4 text-bold text-uppercase my1">{name}</div>}
        { description && <div className="text-grey-4 my1">{description}</div>}
        {children}
    </div>

const EditMap = ({ map, onMapChange, originalMap, geoJson, geoJsonLoading, geoJsonError, onLoadGeoJson, onCancel, onSave }) =>
    <div className="mx2">
        <h2>{ !originalMap ? "Add a new map" : "Edit map" }</h2>
        <SettingContainer description="What do you want to call this map?">
            <div className="flex">
                <input
                    type="text"
                    className="SettingsInput AdminInput bordered rounded h3"
                    placeholder="e.g. United Kingdom, Brazil, Mars"
                    value={map.name}
                    onChange={(e) => onMapChange({ ...map, "name": e.target.value })}
                />
            </div>
        </SettingContainer>
        <SettingContainer description="URL for the GeoJSON file you want to use">
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
        </SettingContainer>
        { (geoJson || geoJsonLoading || geoJsonError) &&
            <LoadingAndErrorWrapper loading={geoJsonLoading} error={geoJsonError}>
            { () => // eslint-disable-line react/display-name
                <div>
                    <SettingContainer description="Which property specifies the region’s identifier?">
                        <GeoJsonPropertySelect
                            value={map.region_key}
                            onChange={(value) => onMapChange({ ...map, "region_key": value })}
                            geoJson={geoJson}
                        />
                    </SettingContainer>
                    <SettingContainer description="Which property specifies the region’s display name?">
                        <GeoJsonPropertySelect
                            value={map.region_name}
                            onChange={(value) => onMapChange({ ...map, "region_name": value })}
                            geoJson={geoJson}
                        />
                    </SettingContainer>
                </div>
            }
            </LoadingAndErrorWrapper>
        }
        <div className="py1">
            <button className={cx("Button Button--borderless")} onClick={onCancel}>Cancel</button>
            <button className={cx("Button Button--primary ml1", { "disabled" : !map.name || !map.url || !map.region_name || !map.region_key })} onClick={onSave}>
                {originalMap ? "Save map" : "Add map"}
            </button>
        </div>
    </div>
