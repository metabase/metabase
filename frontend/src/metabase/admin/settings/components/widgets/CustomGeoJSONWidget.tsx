import cx from "classnames";
import { type ChangeEvent, memo, useCallback, useState } from "react";
import { t } from "ttag";

import noResultsSource from "assets/img/no_results.svg";
import { useLazyLoadGeoJSONQuery } from "metabase/api/geojson";
import { useAdminSetting } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Modal } from "metabase/common/components/Modal";
import { Option, Select } from "metabase/common/components/Select";
import AdminS from "metabase/css/admin.module.css";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { uuid } from "metabase/lib/uuid";
import { Button, Image, Stack, Text } from "metabase/ui";
import { LeafletChoropleth } from "metabase/visualizations/components/LeafletChoropleth";
import type {
  CustomGeoJSONMap,
  CustomGeoJSONSetting,
  GeoJSONData,
} from "metabase-types/api";

import { SettingHeader } from "../SettingHeader";

export const CustomGeoJSONWidget = () => {
  const [map, setMap] = useState<CustomGeoJSONMap | undefined>();
  const [originalMap, setOriginalMap] = useState<
    CustomGeoJSONMap | undefined
  >();
  const [currentId, setCurrentId] = useState<string | undefined>();
  const [triggerLoadGeoJSON, result] = useLazyLoadGeoJSONQuery();
  const {
    data: geoJson,
    error: geoJsonError,
    isFetching: geoJsonLoading,
  } = result;

  const {
    value: settingValue,
    updateSetting,
    settingDetails,
  } = useAdminSetting("custom-geojson");

  const customGeoJsonSetting = settingValue as CustomGeoJSONSetting;
  const mapsExcludingBuiltIns = getMapsExcludingBuiltIns(customGeoJsonSetting);

  const handleSave = useCallback(async (): Promise<void> => {
    if (map && map.region_key && map.region_name && currentId) {
      const newValue = { ...mapsExcludingBuiltIns, [currentId]: map };

      await updateSetting({
        key: "custom-geojson",
        value: newValue,
      });
      setMap(undefined);
      setOriginalMap(undefined);
    }
  }, [currentId, map, mapsExcludingBuiltIns, updateSetting]);

  const handleCancel = useCallback(async (): Promise<void> => {
    setMap(undefined);
    setOriginalMap(undefined);
    setCurrentId(undefined);
  }, []);

  const handleDelete = useCallback(
    async (mapId: string): Promise<void> => {
      const newValue = { ...mapsExcludingBuiltIns };
      delete newValue[mapId];
      await updateSetting({
        key: "custom-geojson",
        value: newValue,
      });
    },
    [mapsExcludingBuiltIns, updateSetting],
  );

  const handleAddMap = useCallback(() => {
    setMap({
      name: "",
      url: "",
      region_key: "",
      region_name: "",
    });
    setOriginalMap(undefined);
    setCurrentId(uuid());
  }, []);

  const handleEditMap = useCallback(
    (mapToEdit: CustomGeoJSONMap, mapId: string) => {
      setMap({ ...mapToEdit });
      setOriginalMap(mapToEdit);
      setCurrentId(mapId);
      triggerLoadGeoJSON({ url: mapToEdit.url }, true);
    },
    [triggerLoadGeoJSON],
  );

  const handleMapChange = useCallback((updatedMap: CustomGeoJSONMap) => {
    setMap(updatedMap);
  }, []);

  if (
    !customGeoJsonSetting ||
    !settingDetails ||
    settingDetails.is_env_setting
  ) {
    return null;
  }

  const hasCustomMaps = Object.values(customGeoJsonSetting).some(
    (map) => !map.builtin,
  );

  return (
    <div className={CS.flexFull}>
      <div className={cx(CS.flex, CS.justifyBetween)}>
        <SettingHeader
          id={settingDetails.key}
          title={t`Custom maps`}
          description={t`Add your own GeoJSON files to enable different region map visualizations`}
        />
        {!map && (
          <Button
            className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary, CS.ml1)}
            onClick={handleAddMap}
            variant="filled"
          >
            {t`Add a map`}
          </Button>
        )}
      </div>

      {!hasCustomMaps && (
        <Stack p="xl" align="center" gap="md">
          <Image w={120} h={120} src={noResultsSource} />
          <Text fw="700" c="text-tertiary">{t`No custom maps yet`}</Text>
        </Stack>
      )}

      {hasCustomMaps && (
        <ListMaps
          maps={customGeoJsonSetting}
          onEditMap={handleEditMap}
          onDeleteMap={handleDelete}
        />
      )}

      {map ? (
        <Modal wide>
          <div className={CS.p4}>
            <EditMap
              map={map}
              originalMap={originalMap}
              onMapChange={handleMapChange}
              geoJson={geoJson}
              geoJsonLoading={geoJsonLoading}
              geoJsonError={geoJsonError}
              onLoadGeoJson={() => triggerLoadGeoJSON({ url: map.url })}
              onCancel={handleCancel}
              onSave={handleSave}
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
};

interface ListMapsProps {
  maps: CustomGeoJSONSetting;
  onEditMap: (map: CustomGeoJSONMap, mapId: string) => void;
  onDeleteMap: (mapId: string) => void;
}

const ListMaps = ({ maps, onEditMap, onDeleteMap }: ListMapsProps) => {
  const [mapIdToDelete, setMapIdToDelete] = useState<string | undefined>(
    undefined,
  );

  return (
    <section>
      <table className={AdminS.ContentTable}>
        <thead>
          <tr>
            <th>{t`Name`}</th>
            <th>{t`URL`}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(maps)
            .filter(([, map]) => !map.builtin)
            .map(([mapId, map]) => (
              <tr key={mapId}>
                <td
                  className={CS.cursorPointer}
                  onClick={() => onEditMap(map, mapId)}
                >
                  {map.name}
                </td>
                <td
                  className={CS.cursorPointer}
                  onClick={() => onEditMap(map, mapId)}
                >
                  <Ellipsified style={{ maxWidth: 400 }}>{map.url}</Ellipsified>
                </td>
                <td className={AdminS.TableActions}>
                  <Button
                    variant="filled"
                    color="danger"
                    onClick={() => setMapIdToDelete(mapId)}
                  >{t`Remove`}</Button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <ConfirmModal
        opened={Boolean(mapIdToDelete)}
        title={t`Delete custom map`}
        onConfirm={() => {
          if (mapIdToDelete) {
            onDeleteMap(mapIdToDelete);
            setMapIdToDelete(undefined);
          }
        }}
        onClose={() => setMapIdToDelete(undefined)}
      />
    </section>
  );
};

interface GeoJsonPropertySelectProps {
  value: string | null;
  onChange: (value: string) => void;
  geoJson: GeoJSONData | undefined;
  dataTestId: string;
}

const GeoJsonPropertySelect = ({
  value,
  onChange,
  geoJson,
  dataTestId,
}: GeoJsonPropertySelectProps) => {
  const options: Record<string, any[]> = {};
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
    <div data-testid={dataTestId}>
      <Select
        value={value || ""}
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          onChange(e.target.value)
        }
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
    </div>
  );
};

interface SettingContainerProps {
  name?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

const SettingContainer = ({
  name,
  description,
  className = CS.py1,
  children,
}: SettingContainerProps) => (
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

interface EditMapProps {
  map: CustomGeoJSONMap;
  onMapChange: (map: CustomGeoJSONMap) => void;
  originalMap: CustomGeoJSONMap | undefined;
  geoJson: GeoJSONData | undefined;
  geoJsonLoading: boolean;
  geoJsonError: any;
  onLoadGeoJson: () => void;
  onCancel: () => void;
  onSave: () => void;
}

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
}: EditMapProps) => (
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
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onMapChange({ ...map, name: e.target.value })
              }
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
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onMapChange({ ...map, url: e.target.value })
              }
            />
            <button
              disabled={!map.url}
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
            description={t`Which property specifies the region's identifier?`}
          >
            <GeoJsonPropertySelect
              value={map.region_key}
              onChange={(value) => onMapChange({ ...map, region_key: value })}
              geoJson={geoJson}
              dataTestId={"map-region-key-select"}
            />
          </SettingContainer>
          <SettingContainer
            description={t`Which property specifies the region's display name?`}
          >
            <GeoJsonPropertySelect
              value={map.region_name}
              onChange={(value) => onMapChange({ ...map, region_name: value })}
              geoJson={geoJson}
              dataTestId={"map-region-name-select"}
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
            <LoadingAndErrorWrapper
              className={cx(CS.flex, CS.fullHeight, CS.fullWidth)}
              loading={geoJsonLoading}
              error={geoJsonError}
            >
              <div className={cx(CS.spread, CS.relative)}>
                {/* The key is needed to update the map in the ChoroplethPreview.
                    ChoroplethPreview eventually renders a CardRenderer but the props
                    that we provide in this specific use-case never change, hence the key.
                 */}
                <ChoroplethPreview geoJson={geoJson} key={map.url} />
              </div>
            </LoadingAndErrorWrapper>
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
          disabled={
            !map.name || !map.url || !map.region_name || !map.region_key
          }
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

interface ChoroplethPreviewProps {
  geoJson: GeoJSONData | undefined;
}

const ChoroplethPreview = memo(({ geoJson }: ChoroplethPreviewProps) => (
  <LeafletChoropleth geoJson={geoJson} />
));

ChoroplethPreview.displayName = "ChoroplethPreview";

function getMapsExcludingBuiltIns(
  allMaps: CustomGeoJSONSetting,
): CustomGeoJSONSetting {
  if (!allMaps) {
    return {};
  }
  const mapsExcludingBuiltIns: CustomGeoJSONSetting = {};
  for (const [id, map] of Object.entries(allMaps)) {
    if (!map.builtin) {
      mapsExcludingBuiltIns[id] = map;
    }
  }

  return mapsExcludingBuiltIns;
}
