import React from "react";

import ChartSettingsWidget from "../ChartSettingsWidget";

import _ from "underscore";

const chartSettingNestedSettings = ({
  getObjectKey,
  getSettingsWidgetsForObject,
}) => ComposedComponent =>
  class extends React.Component {
    constructor(props) {
      super(props);
      this.state = {
        editingObjectKey:
          props.initialKey ||
          (props.objects.length === 1 ? getObjectKey(props.objects[0]) : null),
      };
    }

    componentWillReceiveProps(nextProps) {
      // reset editingObjectKey if there's only one object
      if (
        nextProps.objects.length === 1 &&
        this.state.editingObjectKey !== getObjectKey(nextProps.objects[0])
      ) {
        this.setState({
          editingObjectKey: getObjectKey(nextProps.objects[0]),
        });
      }
    }

    handleChangeEditingObject = editingObject => {
      this.setState({
        editingObjectKey: editingObject ? getObjectKey(editingObject) : null,
      });
      // special prop to notify ChartSettings it should unswap replaced widget
      if (!editingObject && this.props.onEndEditing) {
        this.props.onEndEditing();
      }
    };

    handleChangeSettingsForEditingObject = newSettings => {
      const { editingObjectKey } = this.state;
      this.handleChangeSettingsForObjectKey(editingObjectKey, newSettings);
    };

    handleChangeSettingsForObject = (object, newSettings) => {
      this.handleChangeSettingsForObjectKey(getObjectKey(object), newSettings);
    };

    handleChangeSettingsForObjectKey = (objectKey, newSettings) => {
      const { onChange } = this.props;
      const objectsSettings = this.props.value || {};
      const objectSettings = objectsSettings[objectKey] || {};
      onChange({
        ...objectsSettings,
        [objectKey]: {
          ...objectSettings,
          ...newSettings,
        },
      });
    };

    render() {
      const { series, objects, extra } = this.props;
      const { editingObjectKey } = this.state;
      const objectsSettings = this.props.value || {};

      const editingObject = _.find(
        objects,
        o => getObjectKey(o) === editingObjectKey,
      );
      if (editingObject) {
        const objectSettings = objectsSettings[editingObjectKey] || {};
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
      } else {
        return (
          <ComposedComponent
            {...this.props}
            getObjectKey={getObjectKey}
            onChangeEditingObject={this.handleChangeEditingObject}
            onChangeObjectSettings={this.handleChangeSettingsForObject}
          />
        );
      }
    }
  };

export default chartSettingNestedSettings;
