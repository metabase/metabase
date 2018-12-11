import React from "react";

import cx from "classnames";
import _ from "underscore";

import QueryVisualization from "../components/QueryVisualization";

import Icon from "metabase/components/Icon";
import RoundButtonWithIcon from "metabase/components/RoundButtonWithIcon";

import DisplayPicker from "./visualize/DisplayPicker";

export default class QuestionVisualize extends React.Component {
  state = {
    showSettings: false,
  };
  render() {
    const { showSettings } = this.state;
    return (
      <div className="flex-full flex flex-column">
        <QuestionHeader {...this.props} />
        <div className="flex-full flex flex-row">
          {showSettings && <QuestionVisualizeSettings {...this.props} />}
          <QuestionVisualizeMain
            {...this.props}
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

const QuestionHeader = ({ question }) => {
  return <div className="p4 bg-white">{question.displayName()}</div>;
};

const QuestionVisualizeMain = props => {
  const { setMode } = props;
  return (
    <div className="m3 flex-full flex flex-column">
      <div className="flex-full flex flex-column relative rounded bordered shadowed bg-white">
        <QueryVisualization
          {...props}
          className="flex-full wrapper mb2 z1"
          noHeader
        />
        <RoundButtonWithIcon
          icon="expand"
          className="absolute bordered bg-white text-brand"
          style={{ bottom: -16, left: -16 }}
          onClick={() => setMode("present")}
        />
      </div>
      <QuestionVisualizeFooter {...props} />
    </div>
  );
};

const QuestionVisualizeFooter = ({
  question,
  setDisplayFn,
  onToggleSettings,
}) => (
  <div className="mt3 flex-no-shrink flex layout-centered">
    <DisplayPicker
      value={question.display()}
      onChange={setDisplayFn}
      onToggleSettings={onToggleSettings}
    />
  </div>
);

const QuestionVisualizeSettings = () => {
  return (
    <div
      className="m3 p3 rounded bordered shadowed bg-white"
      style={{ width: 300 }}
    >
      settings
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
