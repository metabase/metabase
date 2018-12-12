import React from "react";
import { Box, Flex } from "grid-styled";

import QueryVisualization from "../components/QueryVisualization";
import ChartSettings from "metabase/visualizations/components/ChartSettings";

import { Absolute, Fixed } from "metabase/components/Position";
import Card from "metabase/components/Card";

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
      <Flex flex={1} style={{ overflow: "hidden" }}>
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
      </Flex>
    );
  }
}

const QuestionVisualizeMain = props => {
  const { setMode, showSettings } = props;
  return (
    <Flex flex={1} m={4}>
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
    </Flex>
  );
};

const QuestionVisualizeFooter = ({
  question,
  setDisplayFn,
  showSettings,
  onToggleSettings,
}) => (
  <Fixed bottom={0} left={0} right={0} className="z5 flex">
    <Box ml="auto" mr="auto" mb={2}>
      <DisplayPicker
        value={question.display()}
        onChange={setDisplayFn}
        showSettings={showSettings}
        onToggleSettings={onToggleSettings}
      />
    </Box>
  </Fixed>
);

const QuestionVisualizeSettings = props => {
  return (
    <Card m={3} style={{ width: 300 }}>
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
    </Card>
  );
};
const QuestionVisualizeColumns = () => {
  return (
    <Card m={3} style={{ width: 300 }}>
      columns
    </Card>
  );
};
