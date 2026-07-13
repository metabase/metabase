/* eslint-disable react/prop-types */
/* eslint-disable react/display-name */
import { Component } from "react";
import _ from "underscore";

import { updateSettings } from "metabase/visualizations/lib/settings";
import { getSettingsWidgets } from "metabase/visualizations/lib/widgets";

import ChartSettingsWidget from "../ChartSettingsWidget";

/**
 * @deprecated HOCs are deprecated
 */
export const chartSettingNestedSettings = (ComposedComponent) =>
  class extends Component {
    constructor(props) {
      super(props);
      this.state = {};
    }

    getEditingObjectKey = () => {
      const { getObjectKey } = this.props;
      return (
        this.state.objectKeyOverride ||
        (this.props.initialKey ??
          (this.props.objects.length === 1
            ? getObjectKey(this.props.objects[0])
            : null))
      );
    };

    handleChangeEditingObject = (editingObject) => {
      const { getObjectKey } = this.props;
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

    handleChangeSettingsForEditingObject = (newSettings) => {
      const editingObjectKey = this.getEditingObjectKey();
      if (editingObjectKey != null) {
        this.handleChangeSettingsForObjectKey(editingObjectKey, newSettings);
      }
    };

    handleChangeSettingsForObject = (object, newSettings) => {
      const objectKey = this.props.getObjectKey(object);
      if (objectKey != null) {
        this.handleChangeSettingsForObjectKey(objectKey, newSettings);
      }
    };

    handleChangeSettingsForObjectKey = (changedKey, changedSettings) => {
      const { objects, onChange, getObjectKey, getObjectSettings } = this.props;
      const oldSettings = this.props.value || {};
      const newSettings = objects.reduce((newSettings, object) => {
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
        return newSettings;
      }, {});
      onChange(newSettings);
    };

    getSettingsWidgetsForObject = (
      series,
      object,
      storedSettings,
      onChangeSettings,
      extra,
    ) => {
      const { getSettingDefinitionsForObject, getComputedSettingsForObject } =
        this.props;
      const settingsDefs = getSettingDefinitionsForObject(series, object);
      const computedSettings = getComputedSettingsForObject(
        series,
        object,
        storedSettings,
        extra,
      );
      const widgets = getSettingsWidgets(
        settingsDefs,
        storedSettings,
        computedSettings,
        object,
        onChangeSettings,
        extra,
      );

      return widgets.map((widget) => ({
        ...widget,
        style: {
          ...widget.style,
          marginLeft: 0,
          marginRight: 0,
        },
      }));
    };

    render() {
      const { series, objects, extra, getObjectKey, getObjectSettings } =
        this.props;
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
          const objectSettingsWidgets = this.getSettingsWidgetsForObject(
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
