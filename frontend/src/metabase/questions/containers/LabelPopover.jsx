/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import LabelPicker from "../components/LabelPicker.jsx";

import { setLabeled } from "../questions";
import { getLabels } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
    labels: props.labels || getLabels(state, props),
  };
};

const mapDispatchToProps = {
  setLabeled,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class LabelPopover extends Component {
  static propTypes = {
    labels: PropTypes.array.isRequired,
    item: PropTypes.object,
    count: PropTypes.number,
    setLabeled: PropTypes.func.isRequired,
  };

  render() {
    const { labels, setLabeled, item, count } = this.props;
    return (
      <PopoverWithTrigger {...this.props}>
        {() => (
          <LabelPicker
            labels={labels}
            setLabeled={setLabeled}
            item={item}
            count={count}
          />
        )}
      </PopoverWithTrigger>
    );
  }
}
