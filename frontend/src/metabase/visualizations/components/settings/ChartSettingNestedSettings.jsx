import React from "react";

import ChartSettingsWidget from "../ChartSettingsWidget";

const chartSettingNestedSettings = ({
  getObjectKey,
  getSettingsWidgetsForObject,
}) => ComposedComponent =>
  class extends React.Component {
    constructor(props) {
      super(props);
      this.state = {
        editingObject: props.objects.length === 1 ? props.objects[0] : null,
      };
    }

    componentWillReceiveProps(nextProps) {
      // reset editingObject if there's only one object
      if (
        nextProps.objects.length === 1 &&
        this.state.editingObject !== nextProps.objects[0]
      ) {
        this.setState({
          editingObject: nextProps.objects[0],
        });
      }
    }

    handleChangeEditingObject = editingObject => {
      this.setState({ editingObject });
    };

    handleChangeSettingsForEditingObject = newSettings => {
      this.handleChangeSettingsForObject(this.state.editingObject, newSettings);
    };

    handleChangeSettingsForObject = (object, newSettings) => {
      const { onChange } = this.props;

      const objectKey = getObjectKey(object);
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
      const { editingObject } = this.state;
      const objectsSettings = this.props.value || {};

      if (editingObject) {
        const objectKey = getObjectKey(editingObject);
        const objectSettings = objectsSettings[objectKey] || {};
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
