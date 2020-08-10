import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Utils from "metabase/lib/utils";
import Select, { Option } from "metabase/components/Select";
import Confirm from "metabase/components/Confirm";
import Ellipsified from "metabase/components/Ellipsified";
import Modal from "metabase/components/Modal";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import SettingHeader from "../SettingHeader";

import { SettingsApi, GeoJSONApi } from "metabase/services";

import cx from "classnames";

import LeafletChoropleth from "metabase/visualizations/components/LeafletChoropleth";

import pure from "recompose/pure";

export default class CustomGeoJSONWidget extends Component {
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

  static propTypes = {
    setting: PropTypes.object.isRequired,
    reloadSettings: PropTypes.func.isRequired,
  };
  static defaultProps = {};

  _saveMap = async (id, map) => {
    const { setting } = this.props;

    const value = {};
    for (const [existingId, existingMap] of Object.entries(setting.value)) {
      if (!existingMap.builtin) {
        value[existingId] = { ...existingMap, id: undefined };
      }
    }
    if (map) {
      value[id] = { ...map, id: undefined };
    } else {
      delete value[id];
    }

    await SettingsApi.put({
      key: "custom-geojson",
      value: value,
    });

    await this.props.reloadSettings();
  };

  _save = async () => {
    const { map } = this.state;
    await this._saveMap(map.id, map);
    this.setState({ map: null, originalMap: null });
  };

  _cancel = async () => {
    const { map, originalMap } = this.state;
    await this._saveMap(map.id, originalMap);
    this.setState({ map: null, originalMap: null });
  };

  _delete = async map => {
    await this._saveMap(map.id, null);
  };

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
      const geoJson = await GeoJSONApi.get({ id: map.id });
      this.setState({
        geoJson: geoJson,
        geoJsonLoading: false,
        geoJsonError: null,
      });
    } catch (e) {
      this.setState({
        geoJson: null,
        geoJsonLoading: false,
        geoJsonError: e,
      });
      console.warn("map fetch failed", e);
    }
  };

  render() {
    const { setting } = this.props;

    return (
      <div className="flex-full">
        <div className="flex">
          <SettingHeader setting={setting} />
          {!this.state.map && (
            <button
              className="Button Button--primary flex-align-right"
              onClick={() =>
                this.setState({
                  map: {
                    id: Utils.uuid(),
                    name: "",
                    url: "",
                    region_key: null,
                    region_name: null,
                  },
                  originalMap: null,
                  geoJson: null,
                  geoJsonLoading: false,
                  geoJsonError: null,
                })
              }
            >
              {t`Add a map`}
            </button>
          )}
        </div>
        <ListMaps
          maps={Object.entries(setting.value).map(([key, value]) => ({
            ...value,
            id: key,
          }))}
          onEditMap={map =>
            this.setState(
              {
                map: {
                  ...map,
                },
                originalMap: map,
                geoJson: null,
                geoJsonLoading: false,
                geoJsonError: null,
              },
              this._loadGeoJson,
            )
          }
          onDeleteMap={this._delete}
        />
        {this.state.map ? (
          <Modal wide>
            <div className="p4">
              <EditMap
                map={this.state.map}
                originalMap={this.state.originalMap}
                onMapChange={map => this.setState({ map })}
                geoJson={this.state.geoJson}
                geoJsonLoading={this.state.geoJsonLoading}
                geoJsonError={this.state.geoJsonError}
                onLoadGeoJson={this._loadGeoJson}
                onCancel={this._cancel}
                onSave={this._save}
              />
            </div>
          </Modal>
        ) : null}
      </div>
    );
  }
}

const ListMaps = ({ maps, onEditMap, onDeleteMap }) => (
  <section>
    <table className="ContentTable">
      <thead>
        <tr>
          <th>{t`Name`}</th>
          <th>{t`URL`}</th>
        </tr>
      </thead>
      <tbody>
        {maps
          .filter(map => !map.builtin)
          .map(map => (
            <tr key={map.id}>
              <td className="cursor-pointer" onClick={() => onEditMap(map)}>
                {map.name}
              </td>
              <td className="cursor-pointer" onClick={() => onEditMap(map)}>
                <Ellipsified style={{ maxWidth: 600 }}>{map.url}</Ellipsified>
              </td>
              <td className="Table-actions">
                <Confirm
                  action={() => onDeleteMap(map)}
                  title={t`Delete custom map`}
                >
                  <button className="Button Button--danger">{t`Remove`}</button>
                </Confirm>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  </section>
);

const GeoJsonPropertySelect = ({ value, onChange, geoJson }) => {
  const options = {};
  if (geoJson) {
    for (const feature of geoJson.features) {
      for (const property in feature.properties) {
        options[property] = options[property] || [];
        options[property].push(feature.properties[property]);
      }
    }
  }

  return (
    <Select
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={t`Select…`}
    >
      {Object.entries(options).map(([name, values]) => (
        <Option key={name} value={name}>
          <div>
            <div>{name}</div>
            <div
              className="mt1 h6"
              style={{
                maxWidth: 250,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {t`Sample values:`} {values.join(", ")}
            </div>
          </div>
        </Option>
      ))}
    </Select>
  );
};

const SettingContainer = ({
  name,
  description,
  className = "py1",
  children,
}) => (
  <div className={className}>
    {name && (
      <div className="text-medium text-bold text-uppercase my1">{name}</div>
    )}
    {description && <div className="text-medium my1">{description}</div>}
    {children}
  </div>
);

const EditMap = ({
  map,
  onMapChange,
  originalMap,
  geoJson,
  geoJsonLoading,
  geoJsonError,
  onLoadGeoJson,
  onCancel,
  onSave,
}) => (
  <div>
    <div className="flex">
      <div className="flex-no-shrink">
        <h2>{!originalMap ? t`Add a new map` : t`Edit map`}</h2>
        <SettingContainer description={t`What do you want to call this map?`}>
          <div className="flex">
            <input
              type="text"
              className="SettingsInput AdminInput bordered rounded h3"
              placeholder={t`e.g. United Kingdom, Brazil, Mars`}
              value={map.name}
              onChange={e => onMapChange({ ...map, name: e.target.value })}
            />
          </div>
        </SettingContainer>
        <SettingContainer
          description={t`URL for the GeoJSON file you want to use`}
        >
          <div className="flex">
            <input
              type="text"
              className="SettingsInput AdminInput bordered rounded h3"
              placeholder={t`Like https://my-mb-server.com/maps/my-map.json`}
              value={map.url}
              onChange={e => onMapChange({ ...map, url: e.target.value })}
            />
            <button
              className={cx("Button ml1", {
                "Button--primary": !geoJson,
                disabled: !map.url,
              })}
              onClick={onLoadGeoJson}
            >
              {geoJson ? t`Refresh` : t`Load`}
            </button>
          </div>
        </SettingContainer>
        <div className={cx({ disabled: !geoJson })}>
          <SettingContainer
            description={t`Which property specifies the region’s identifier?`}
          >
            <GeoJsonPropertySelect
              value={map.region_key}
              onChange={value => onMapChange({ ...map, region_key: value })}
              geoJson={geoJson}
            />
          </SettingContainer>
          <SettingContainer
            description={t`Which property specifies the region’s display name?`}
          >
            <GeoJsonPropertySelect
              value={map.region_name}
              onChange={value => onMapChange({ ...map, region_name: value })}
              geoJson={geoJson}
            />
          </SettingContainer>
        </div>
      </div>
      <div className="flex-full ml4 relative bordered rounded flex my4">
        {geoJson || geoJsonLoading || geoJsonError ? (
          <LoadingAndErrorWrapper loading={geoJsonLoading} error={geoJsonError}>
            {() => (
              <div className="m4 spread relative">
                <ChoroplethPreview geoJson={geoJson} />
              </div>
            )}
          </LoadingAndErrorWrapper>
        ) : (
          <div className="flex-full flex layout-centered text-bold text-light text-centered">
            {t`Load a GeoJSON file to see a preview`}
          </div>
        )}
      </div>
    </div>
    <div className="py1 flex">
      <div className="ml-auto">
        <button
          className={cx("Button Button")}
          onClick={onCancel}
        >{t`Cancel`}</button>
        <button
          className={cx("Button Button--primary ml1", {
            disabled:
              !map.name || !map.url || !map.region_name || !map.region_key,
          })}
          onClick={onSave}
        >
          {originalMap ? t`Save map` : t`Add map`}
        </button>
      </div>
    </div>
  </div>
);

const ChoroplethPreview = pure(({ geoJson }) => (
  <LeafletChoropleth geoJson={geoJson} />
));
