import React, { Component } from "react";
import ReactDOM from "react-dom";

import { UtilApi } from "metabase/services";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import reactAnsiStyle from "react-ansi-style";
import "react-ansi-style/inject-css";

import _ from "underscore";

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

export default class Logs extends Component {
  constructor() {
    super();
    this.state = {
      logs: [],
      scrollToBottom: true,
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
    this.setState({ logs: logs.reverse() });
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
    const { logs } = this.state;
    return (
      <LoadingAndErrorWrapper loading={!logs || logs.length === 0}>
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
            {reactAnsiStyle(React, logs.join("\n"))}
          </div>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
