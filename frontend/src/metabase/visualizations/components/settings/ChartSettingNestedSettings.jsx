/* eslint-disable react/prop-types */
/* eslint-disable react/display-name */
import { Component } from "react";
import _ from "underscore";

import { updateSettings } from "metabase/visualizations/lib/settings";

import ChartSettingsWidget from "../ChartSettingsWidget";

/**
 * @deprecated HOCs are deprecated
 */
const chartSettingNestedSettings =
  ({ getObjectKey, getObjectSettings, getSettingsWidgetsForObject }) =>
  ComposedComponent =>
    class extends Component {
      constructor(props) {
        super(props);
        this.state = {};
      }

      getEditingObjectKey = () => {
        return (
          this.state.objectKeyOverride ||
          (this.props.initialKey ??
            (this.props.objects.length === 1
              ? getObjectKey(this.props.objects[0])
              : null))
        );
      };

      handleChangeEditingObject = editingObject => {
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

      handleChangeSettingsForEditingObject = newSettings => {
        const editingObjectKey = this.getEditingObjectKey();
        if (editingObjectKey != null) {
          this.handleChangeSettingsForObjectKey(editingObjectKey, newSettings);
        }
      };

      handleChangeSettingsForObject = (object, newSettings) => {
        const objectKey = getObjectKey(object);
        if (objectKey != null) {
          this.handleChangeSettingsForObjectKey(objectKey, newSettings);
        }
      };

      handleChangeSettingsForObjectKey = (changedKey, changedSettings) => {
        const { objects, onChange } = this.props;
        const oldSettings = this.props.value || {};
        const newSettings = objects.reduce((newSettings, object) => {
          const currentKey = getObjectKey(object);
          const objectSettings = getObjectSettings(oldSettings, object);
          if (currentKey === changedKey) {
            newSettings[currentKey] = updateSettings(
              objectSettings,
              changedSettings,
            );
          } else {
            newSettings[currentKey] = objectSettings;
          }
          return newSettings;
        }, {});
        onChange(newSettings);
      };

      render() {
        const { series, objects, extra } = this.props;
        const editingObjectKey = this.getEditingObjectKey();
        if (editingObjectKey !== undefined) {
          const editingObject = _.find(
            objects,
            o => getObjectKey(o) === editingObjectKey,
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
                objectSettingsWidgets={objectSettingsWidgets.map(widget => (
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

export default chartSettingNestedSettings;
