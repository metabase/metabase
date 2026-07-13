/* eslint-disable react/display-name */
import { Component, type ComponentType } from "react";
import _ from "underscore";

import { updateSettings } from "metabase/visualizations/lib/settings";
import type { Series, VisualizationSettings } from "metabase-types/api";

import ChartSettingsWidget from "../ChartSettingsWidget";

type AnySettingsWidget = {
  id: string;
  [key: string]: unknown;
};

type ChartSettingNestedSettingsConfig<T> = {
  getObjectKey: (object: T) => string;
  getObjectSettings: (
    allStoredSettings: Record<string, VisualizationSettings>,
    object: T,
  ) => any;
  getSettingsWidgetsForObject: (
    series: Series,
    object: T,
    storedSettings: VisualizationSettings,
    onChangeSettings: (newSettings: Partial<VisualizationSettings>) => void,
    extra: any,
  ) => AnySettingsWidget[];
};

type ChartSettingNestedSettingsProps<T> = {
  series: Series;
  objects: T[];
  value?: Record<string, VisualizationSettings>;
  onChange: (value: Record<string, VisualizationSettings>) => void;
  initialKey?: string | null;
  onEndShowWidget?: () => void;
  extra?: any;
};

type ChartSettingNestedSettingsState = {
  objectKeyOverride?: string | null;
};

/**
 * @deprecated HOCs are deprecated
 */
export const chartSettingNestedSettings = <T,>({
  getObjectKey,
  getObjectSettings,
  getSettingsWidgetsForObject,
}: ChartSettingNestedSettingsConfig<T>) => {
  return (ComposedComponent: ComponentType<any>): ComponentType<any> => {
    const Wrapped = class extends Component<
      ChartSettingNestedSettingsProps<T> & Record<string, unknown>,
      ChartSettingNestedSettingsState
    > {
      state: ChartSettingNestedSettingsState = {};

      getEditingObjectKey = (): string | null | undefined => {
        return (
          this.state.objectKeyOverride ||
          (this.props.initialKey ??
            (this.props.objects.length === 1
              ? getObjectKey(this.props.objects[0])
              : null))
        );
      };

      handleChangeEditingObject = (editingObject: T | null) => {
        // objectKeyOverride allows child components to set the editing object key to a different value than is derived
        // from the props. For example, this is used by the "More options" button in ChartNestedSettingSeries.
        this.setState({
          objectKeyOverride: editingObject ? getObjectKey(editingObject) : null,
        });
        // special prop to notify ChartSettings it should unswap replaced widget
        if (!editingObject && this.props.onEndShowWidget) {
          this.props.onEndShowWidget();
        }
      };

      handleChangeSettingsForEditingObject = (
        newSettings: Partial<VisualizationSettings>,
      ) => {
        const editingObjectKey = this.getEditingObjectKey();
        if (editingObjectKey != null) {
          this.handleChangeSettingsForObjectKey(editingObjectKey, newSettings);
        }
      };

      handleChangeSettingsForObject = (
        object: T,
        newSettings: Partial<VisualizationSettings>,
      ) => {
        const objectKey = getObjectKey(object);
        if (objectKey != null) {
          this.handleChangeSettingsForObjectKey(objectKey, newSettings);
        }
      };

      handleChangeSettingsForObjectKey = (
        changedKey: string,
        changedSettings: Partial<VisualizationSettings>,
      ) => {
        const { objects, onChange } = this.props;
        const oldSettings = this.props.value || {};
        const newSettings: Record<string, VisualizationSettings> = {};
        for (const object of objects) {
          const currentKey = getObjectKey(object);
          const objectSettings = getObjectSettings(oldSettings, object);
          if (currentKey === changedKey) {
            newSettings[currentKey] = updateSettings(
              objectSettings,
              changedSettings,
            );
          } else if (objectSettings != null) {
            // Objects without stored settings must not be added as `undefined`
            // entries, which would corrupt the settings map (EMB-1940).
            newSettings[currentKey] = objectSettings;
          }
        }
        onChange(newSettings);
      };

      render() {
        const { series, objects, extra } = this.props;
        const editingObjectKey = this.getEditingObjectKey();
        if (editingObjectKey !== undefined) {
          const editingObject = _.find(
            objects,
            (o) => getObjectKey(o) === editingObjectKey,
          );
          if (editingObject) {
            const objectsSettings = this.props.value || {};
            const objectSettings =
              getObjectSettings(objectsSettings, editingObject) ?? {};
            const objectSettingsWidgets = getSettingsWidgetsForObject(
              series,
              editingObject,
              objectSettings,
              this.handleChangeSettingsForEditingObject,
              extra,
            );
            return (
              <ComposedComponent
                {...this.props}
                getObjectKey={getObjectKey}
                onChangeEditingObject={this.handleChangeEditingObject}
                onChangeObjectSettings={this.handleChangeSettingsForObject}
                object={editingObject}
                objectSettingsWidgets={objectSettingsWidgets.map((widget) => (
                  <ChartSettingsWidget key={widget.id} {...widget} />
                ))}
              />
            );
          }
        }
        return (
          <ComposedComponent
            {...this.props}
            getObjectKey={getObjectKey}
            onChangeEditingObject={this.handleChangeEditingObject}
            onChangeObjectSettings={this.handleChangeSettingsForObject}
          />
        );
      }
    };
    return Wrapped;
  };
};
