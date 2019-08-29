import React, { Component } from "react";

import ColorPicker from "metabase/components/ColorPicker";

export default class ChartSettingColorPicker extends Component {
  render() {
    return (
      <div className="flex align-center mb1">
        <ColorPicker {...this.props} triggerSize={12} />
        {this.props.title && <h4 className="ml1">{this.props.title}</h4>}
      </div>
    );
  }
}
