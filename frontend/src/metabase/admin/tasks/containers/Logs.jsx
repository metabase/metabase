import React, { Component } from "react";
import ReactDOM from "react-dom";

import { UtilApi } from "metabase/services";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import reactAnsiStyle from "react-ansi-style";
import "react-ansi-style/inject-css";

import _ from "underscore";
import moment from "moment";
import { t } from "ttag";

import Select, { Option } from "metabase/components/Select";
import { addCSSRule } from "metabase/lib/dom";
import { color } from "metabase/lib/colors";

const ANSI_COLORS = {
  black: color("text-dark"),
  white: color("text-white"),
  gray: color("text-medium"),
  red: color("saturated-red"),
  green: color("saturated-green"),
  yellow: color("saturated-yellow"),
  blue: color("saturated-blue"),
  magenta: color("saturated-purple"),
  cyan: "cyan",
};
for (const [name, color] of Object.entries(ANSI_COLORS)) {
  addCSSRule(`.react-ansi-style-${name}`, `color: ${color} !important`);
}
const MAX_LOGS = 50000;

function logEventKey(ev) {
  return `${ev.timestamp}, ${ev.process_uuid}, ${ev.fqns}, ${ev.msg}`;
}

function mergeLogs(...logArrays) {
  return _.chain(logArrays)
    .flatten(true)
    .sortBy(ev => ev.msg)
    .sortBy(ev => ev.process_uuid)
    .sortBy(ev => ev.timestamp)
    .uniq(true, logEventKey)
    .last(MAX_LOGS)
    .value();
}

export default class Logs extends Component {
  constructor() {
    super();
    this.state = {
      logs: [],
      scrollToBottom: true,
      selectedProcessUUID: "ALL",
    };

    this._onScroll = () => {
      this.scrolling = true;
      this._onScrollDebounced();
    };
    this._onScrollDebounced = _.debounce(() => {
      const elem = ReactDOM.findDOMNode(this).parentNode;
      const scrollToBottom =
        Math.abs(elem.scrollTop - (elem.scrollHeight - elem.offsetHeight)) < 10;
      this.setState({ scrollToBottom }, () => {
        this.scrolling = false;
      });
    }, 500);
  }

  async fetchLogs() {
    const logs = await UtilApi.logs();
    this.setState({ logs: mergeLogs(this.state.logs, logs.reverse()) });
  }

  componentWillMount() {
    this.timer = setInterval(this.fetchLogs.bind(this), 1000);
  }

  componentDidMount() {
    const elem = ReactDOM.findDOMNode(this).parentNode;
    elem.addEventListener("scroll", this._onScroll, false);
  }

  componentDidUpdate() {
    const elem = ReactDOM.findDOMNode(this).parentNode;
    if (!this.scrolling && this.state.scrollToBottom) {
      if (elem.scrollTop !== elem.scrollHeight - elem.offsetHeight) {
        elem.scrollTop = elem.scrollHeight - elem.offsetHeight;
      }
    }
  }

  componentWillUnmount() {
    const elem = ReactDOM.findDOMNode(this).parentNode;
    elem.removeEventListener("scroll", this._onScroll, false);
    clearTimeout(this.timer);
  }

  render() {
    const { logs, selectedProcessUUID } = this.state;
    const filteredLogs = logs.filter(
      ev =>
        !selectedProcessUUID ||
        selectedProcessUUID === "ALL" ||
        ev.process_uuid === selectedProcessUUID,
    );
    const processUUIDs = _.uniq(
      logs.map(ev => ev.process_uuid).filter(Boolean),
    ).sort();
    const renderedLogs = filteredLogs.map(ev => {
      const timestamp = moment(ev.timestamp).format();
      const uuid = ev.process_uuid || "---";
      return `[${uuid}] ${timestamp} ${ev.level} ${ev.fqns} ${ev.msg}`;
    });

    let processUUIDSelect = null;
    if (processUUIDs.length > 1) {
      processUUIDSelect = (
        <div className="pb1">
          <label>{t`Select Metabase process:`}</label>
          <Select
            defaultValue="ALL"
            value={this.state.selectedProcessUUID}
            onChange={e =>
              this.setState({ selectedProcessUUID: e.target.value })
            }
            className="inline-block ml1"
            width={400}
          >
            <Option value="ALL" key="ALL">{t`All Metabase processes`}</Option>
            {processUUIDs.map(uuid => (
              <Option key={uuid} value={uuid}>
                <code>{uuid}</code>
              </Option>
            ))}
          </Select>
        </div>
      );
    }

    return (
      <div>
        {processUUIDSelect}

        <LoadingAndErrorWrapper
          loading={!filteredLogs || filteredLogs.length === 0}
        >
          {() => (
            <div
              className="rounded bordered bg-light"
              style={{
                fontFamily: '"Lucida Console", Monaco, monospace',
                fontSize: "14px",
                whiteSpace: "pre-line",
                padding: "1em",
              }}
            >
              {reactAnsiStyle(React, renderedLogs.join("\n"))}
            </div>
          )}
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}
