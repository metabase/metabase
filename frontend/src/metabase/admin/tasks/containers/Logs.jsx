import React, { Component } from "react";
import ReactDOM from "react-dom";

import { UtilApi } from "metabase/services";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import reactAnsiStyle from "react-ansi-style";
import "react-ansi-style/inject-css";

import _ from "underscore";
import moment from "moment";
import { t } from "ttag";

import { addCSSRule } from "metabase/lib/dom";
import colors from "metabase/lib/colors";

const ANSI_COLORS = {
  black: colors["text-black"],
  white: colors["text-white"],
  gray: colors["text-medium"],
  red: colors["saturated-red"],
  green: colors["saturated-green"],
  yellow: colors["saturated-yellow"],
  blue: colors["saturated-blue"],
  magenta: colors["saturated-purple"],
  cyan: "cyan",
};
for (const [name, color] of Object.entries(ANSI_COLORS)) {
  addCSSRule(`.react-ansi-style-${name}`, `color: ${color} !important`);
}

function logEventUniqueValue(ev) {
  return `${ev.timestamp}, ${ev.process_uuid}, ${ev.fqns}, ${ev.msg}`;
}

function mergeLogs(...logArrays) {
  let logs = Array.prototype.concat(...logArrays);
  logs = _.sortBy(logs, ev => [ev.timestamp, ev.process_uuid, ev.msg]);
  return _.uniq(logs, true, logEventUniqueValue);
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

    return (
      <div>
        <div className="Form-field">
          <label className="Form-label">Select Metabase process</label>
          <label className="Select mt1">
            <select
              className="Select"
              defaultValue="ALL"
              onChange={e =>
                this.setState({ selectedProcessUUID: e.target.value })
              }
            >
              <option value="" disabled>
                {t`Select Metabase process UUID`}
              </option>
              <option value="ALL">{t`All Metabase processes`}</option>
              {processUUIDs.map(uuid => (
                <option key={uuid} value={uuid}>
                  {uuid}
                </option>
              ))}
            </select>
          </label>
        </div>

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
