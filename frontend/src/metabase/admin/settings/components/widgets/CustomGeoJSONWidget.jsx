/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { memo, Component } from "react";
import { t } from "ttag";

import Confirm from "metabase/components/Confirm";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Modal from "metabase/components/Modal";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Select, { Option } from "metabase/core/components/Select";
import AdminS from "metabase/css/admin.module.css";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { uuid } from "metabase/lib/uuid";
import { SettingsApi, GeoJSONApi } from "metabase/services";
import LeafletChoropleth from "metabase/visualizations/components/LeafletChoropleth";
import { computeMinimalBounds } from "metabase/visualizations/lib/mapping";

import SettingHeader from "../SettingHeader";

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

    try {
      await SettingsApi.put({
        key: "custom-geojson",
        value: value,
      });

      await this.props.reloadSettings();
    } catch (e) {
      console.warn("Save failed: ", e);
      throw e;
    }
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

  _validateGeoJson = geoJson => {
    if (!geoJson) {
      throw t`Invalid custom GeoJSON`;
    }

    if (geoJson.type !== "FeatureCollection" && geoJson.type !== "Feature") {
      throw t`Invalid custom GeoJSON: does not contain features`;
    }

    if (geoJson.type === "FeatureCollection") {
      if (!geoJson.features || geoJson.features.length === 0) {
        throw t`Invalid custom GeoJSON: does not contain features`;
      }

      for (const feature of geoJson.features) {
        if (!feature.properties) {
          throw t`Invalid custom GeoJSON: feature is missing properties`;
        }
      }

      const bounds = computeMinimalBounds(geoJson.features);
      const northEast = bounds.getNorthEast();
      const southWest = bounds.getSouthWest();

      if (
        [
          [northEast.lat, northEast.lng],
          [southWest.lat, southWest.lng],
        ].every(
          ([lat, lng]) => lat < -90 || lat > 90 || lng < -180 || lng > 180,
        )
      ) {
        throw t`Invalid custom GeoJSON: coordinates are outside bounds for latitude and longitude`;
      }
    }

    if (geoJson.type === "Feature") {
      if (!geoJson.properties) {
        throw t`Invalid custom GeoJSON: feature is missing properties`;
      }
    }
  };

  _loadGeoJson = async () => {
    try {
      const { map } = this.state;
      this.setState({
        geoJson: null,
        geoJsonLoading: true,
        geoJsonError: null,
      });
      const geoJson = await GeoJSONApi.load({
        url: encodeURIComponent(map.url),
      });
      this._validateGeoJson(geoJson);
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

    if (!setting.value || setting.is_env_setting) {
      return null;
    }

    return (
      <div className={CS.flexFull}>
        <div className={cx(CS.flex, CS.justifyBetween)}>
          <SettingHeader setting={setting} />
          {!this.state.map && (
            <button
              className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary, CS.ml1)}
              onClick={() =>
                this.setState({
                  map: {
                    id: uuid(),
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
            <div className={CS.p4}>
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
    <table className={AdminS.ContentTable}>
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
              <td className={CS.cursorPointer} onClick={() => onEditMap(map)}>
                {map.name}
              </td>
              <td className={CS.cursorPointer} onClick={() => onEditMap(map)}>
                <Ellipsified style={{ maxWidth: 600 }}>{map.url}</Ellipsified>
              </td>
              <td className={AdminS.TableActions}>
                <Confirm
                  action={() => onDeleteMap(map)}
                  title={t`Delete custom map`}
                >
                  <button
                    className={cx(ButtonsS.Button, ButtonsS.ButtonDanger)}
                  >{t`Remove`}</button>
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
    if (geoJson.type === "FeatureCollection") {
      for (const feature of geoJson.features) {
        for (const property in feature.properties) {
          options[property] = options[property] || [];
          options[property].push(feature.properties[property]);
        }
      }
    } else if (geoJson.type === "Feature") {
      for (const property in geoJson.properties) {
        options[property] = options[property] || [];
        options[property].push(geoJson.properties[property]);
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
            <div style={{ textAlign: "left" }}>{name}</div>
            <div
              className={cx(CS.mt1, CS.h6)}
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
  className = CS.py1,
  children,
}) => (
  <div className={className}>
    {name && (
      <div className={cx(CS.textMedium, CS.textBold, CS.textUppercase, CS.my1)}>
        {name}
      </div>
    )}
    {description && (
      <div className={cx(CS.textMedium, CS.my1)}>{description}</div>
    )}
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
  <div data-testid="edit-map-modal">
    <div className={CS.flex}>
      <div className={CS.flexNoShrink}>
        <h2>{!originalMap ? t`Add a new map` : t`Edit map`}</h2>
        <SettingContainer description={t`What do you want to call this map?`}>
          <div className={CS.flex}>
            <input
              type="text"
              className={cx(
                AdminS.AdminInput,
                AdminS.SettingsInput,
                CS.bordered,
                CS.rounded,
                CS.h3,
              )}
              placeholder={t`e.g. United Kingdom, Brazil, Mars`}
              value={map.name}
              onChange={e => onMapChange({ ...map, name: e.target.value })}
            />
          </div>
        </SettingContainer>
        <SettingContainer
          description={t`URL for the GeoJSON file you want to use`}
        >
          <div className={CS.flex}>
            <input
              type="text"
              className={cx(
                AdminS.AdminInput,
                AdminS.SettingsInput,
                CS.bordered,
                CS.rounded,
                CS.h3,
              )}
              placeholder={t`Like https://my-mb-server.com/maps/my-map.json`}
              value={map.url}
              onChange={e => onMapChange({ ...map, url: e.target.value })}
            />
            <button
              className={cx(ButtonsS.Button, CS.ml1, {
                [ButtonsS.ButtonPrimary]: !geoJson,
                [CS.disabled]: !map.url,
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
      <div
        className={cx(
          CS.flexAuto,
          CS.ml4,
          CS.relative,
          CS.bordered,
          CS.rounded,
          CS.flex,
          CS.my4,
          CS.overflowHidden,
        )}
      >
        {geoJson || geoJsonLoading || geoJsonError ? (
          <LoadingAndErrorWrapper
            className={cx(CS.flex, CS.fullHeight, CS.fullWidth)}
            loading={geoJsonLoading}
            error={geoJsonError}
          >
            {() => (
              <div className={cx(CS.spread, CS.relative)}>
                <ChoroplethPreview geoJson={geoJson} />
              </div>
            )}
          </LoadingAndErrorWrapper>
        ) : (
          <div
            className={cx(
              CS.flexFull,
              CS.flex,
              CS.layoutCentered,
              CS.textBold,
              CS.textLight,
              CS.textCentered,
            )}
          >
            {t`Load a GeoJSON file to see a preview`}
          </div>
        )}
      </div>
    </div>
    <div className={cx(CS.py1, CS.flex)}>
      <div className={CS.mlAuto}>
        <button
          className={ButtonsS.Button}
          onClick={onCancel}
        >{t`Cancel`}</button>
        <button
          className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary, CS.ml1, {
            [CS.disabled]:
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

const ChoroplethPreview = memo(({ geoJson }) => (
  <LeafletChoropleth geoJson={geoJson} />
));

ChoroplethPreview.displayName = "ChoroplethPreview";
