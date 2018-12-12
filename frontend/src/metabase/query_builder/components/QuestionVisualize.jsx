import React from "react";

import QueryVisualization from "../components/QueryVisualization";
import ChartSettings from "metabase/visualizations/components/ChartSettings";

import FloatingButton from "metabase/query_builder/components/FloatingButton";

import DisplayPicker from "./visualize/DisplayPicker";
import ColumnWells from "./visualize/ColumnWells";

export default class QuestionVisualize extends React.Component {
  state = {
    showSettings: false,
  };
  render() {
    const { showSettings } = this.state;
    return (
      <div className="flex-full flex flex-column">
        <div className="flex-full flex flex-row">
          {showSettings && (
            <QuestionVisualizeSettings
              {...this.props}
              onClose={() => this.setState({ showSettings: false })}
            />
          )}
          <QuestionVisualizeMain
            {...this.props}
            showSettings={showSettings}
            onToggleSettings={() =>
              this.setState({ showSettings: !showSettings })
            }
          />
          <QuestionVisualizeColumns {...this.props} />
        </div>
      </div>
    );
  }
}

const QuestionVisualizeMain = props => {
  const { setMode, showSettings } = props;
  return (
    <div className="m3 flex-full flex flex-column">
      <ColumnWells className="flex-full flex" {...props}>
        <div className="flex-full flex relative rounded bordered shadowed bg-white">
          <QueryVisualization
            {...props}
            className="flex-full wrapper mb2 z1"
            noHeader
          />
          <span className="absolute" style={{ bottom: -16, left: -16 }}>
            <FloatingButton icon="expand" onClick={() => setMode("present")} />
          </span>
        </div>
      </ColumnWells>
      <QuestionVisualizeFooter {...props} showSettings={showSettings} />
    </div>
  );
};

const QuestionVisualizeFooter = ({
  question,
  setDisplayFn,
  showSettings,
  onToggleSettings,
}) => (
  <div className="mt3 flex-no-shrink flex layout-centered">
    <DisplayPicker
      value={question.display()}
      onChange={setDisplayFn}
      showSettings={showSettings}
      onToggleSettings={onToggleSettings}
    />
  </div>
);

const QuestionVisualizeSettings = props => {
  return (
    <div
      className="m3 rounded bordered shadowed bg-white"
      style={{ width: 300 }}
    >
      <ChartSettings
        question={props.question}
        addField={props.addField}
        series={[
          {
            card: props.question.card(),
            data: props.result.data,
          },
        ]}
        onChange={newSettings => {
          props.onReplaceAllVisualizationSettings(newSettings);
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
    </div>
  );
};
const QuestionVisualizeColumns = () => {
  return (
    <div
      className="m3 p3 rounded bordered shadowed bg-white"
      style={{ width: 300 }}
    >
      columns
    </div>
  );
};
