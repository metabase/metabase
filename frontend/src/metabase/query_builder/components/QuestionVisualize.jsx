import React from "react";
import { Box, Flex } from "grid-styled";
import styled from "styled-components";

import QueryVisualization from "../components/QueryVisualization";
import ChartSettings from "metabase/visualizations/components/ChartSettings";

import { Absolute, Fixed } from "metabase/components/Position";
import Card from "metabase/components/Card";

import colors from "metabase/lib/colors";
import Button from "metabase/components/Button";

import DisplayPicker from "./visualize/DisplayPicker";
import ColumnWells from "./visualize/ColumnWells";
import ColumnList from "./visualize/ColumnList";
import MetricList from "./visualize/MetricList";

// the margin for the viz with panels open
const VIZ_MARGIN = 340;

const Panel = styled(Card)`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 100%;
  border-radius: 8px;
`;

Panel.defaultProps = {
  m: 3,
  w: 300,
};

export default class QuestionVisualize extends React.Component {
  state = {
    showSettings: false,
  };
  render() {
    const { showSettings } = this.state;
    return (
      <Flex flex={1} className="relative" style={{ overflow: "hidden" }}>
        {showSettings && (
          <Absolute top={0} bottom={80} left={0}>
            <QuestionVisualizeSettings
              {...this.props}
              onClose={() => this.setState({ showSettings: false })}
            />
          </Absolute>
        )}
        <Flex flex={1} ml={showSettings ? VIZ_MARGIN : 20} mr={VIZ_MARGIN}>
          <QuestionVisualizeMain
            {...this.props}
            showSettings={showSettings}
            onToggleSettings={() =>
              this.setState({ showSettings: !showSettings })
            }
          />
        </Flex>
        <Absolute top={0} bottom={80} right={0}>
          <QuestionVisualizeColumns {...this.props} />
        </Absolute>
      </Flex>
    );
  }
}

const QuestionVisualizeMain = props => {
  const { showSettings } = props;
  return (
    <Flex flex={1} m={3} mb={5}>
      <ColumnWells className="flex-full flex" {...props}>
        <div className="flex-full flex relative rounded bordered shadowed bg-white">
          <QueryVisualization
            {...props}
            className="flex-full wrapper mb2 z1"
            noHeader
          />
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
    <Panel>
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
    </Panel>
  );
};

const BucketHeaderButton = styled(Button)`
  border: none;
  background: ${props =>
    props.active ? `rgba(255, 255, 255, 0.12)` : "transparent"};
  color: white;
  &:hover {
    color: white;
    background: rgba(255, 255, 255, 0.22);
    transition: background 300ms linear;
  }
`;

BucketHeaderButton.defaultProps = {
  p: 1,
  m: 1,
  iconSize: 22,
};

class Bucket extends React.Component {
  state = {
    showSource: true,
  };
  render() {
    const { query, rawSeries } = this.props;
    const { showSource } = this.state;
    return (
      <Panel>
        <Flex
          align="center"
          justify="center"
          p={1}
          style={{ flexShrink: 0 }}
          bg={showSource ? colors["accent1"] : colors["accent7"]}
        >
          <BucketHeaderButton
            icon="grid"
            onClick={() => this.setState({ showSource: true })}
            active={showSource}
          />
          <BucketHeaderButton
            icon="insight"
            onClick={() => this.setState({ showSource: false })}
            active={!showSource}
          />
        </Flex>
        <Box style={{ overflowY: "scroll", flex: 1 }} pt={2}>
          {showSource ? (
            <ColumnList query={query} rawSeries={rawSeries} />
          ) : (
            <MetricList query={query} rawSeries={rawSeries} />
          )}
        </Box>
      </Panel>
    );
  }
}
const QuestionVisualizeColumns = props => {
  return <Bucket {...props} />;
};
