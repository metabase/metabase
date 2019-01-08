import React from "react";

import ChartSettings from "metabase/visualizations/components/ChartSettings";

export default class SettingsPanel extends React.Component {
  render() {
    if (!this.props.result || !this.props.question) {
      return null;
    }

    return (
      <ChartSettings
        question={this.props.question}
        addField={this.props.addField}
        series={[
          {
            card: this.props.question.card(),
            data: this.props.result.data,
          },
        ]}
        onChange={newSettings => {
          this.props.onReplaceAllVisualizationSettings(newSettings);
        }}
        // initial={chartSettings}
      >
        {({ sectionPicker, widgetList }) => (
          <div>
            <div className="border-bottom px2">{sectionPicker}</div>
            <div className="pt4 scroll-y">{widgetList}</div>
          </div>
        )}
      </ChartSettings>
    );
  }
}
