import React, { Component } from "react";
import ReactDOM from "react-dom";
import fetch from 'isomorphic-fetch';

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import reactAnsiStyle from "react-ansi-style";
import "react-ansi-style/inject-css";

import _ from "underscore";

export default class Logs extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            logs: [],
            scrollToBottom: true
        };

        this._onScroll = () => {
            this.scrolling = true;
            this._onScrollDebounced();
        }
        this._onScrollDebounced = _.debounce(() => {
            let elem = ReactDOM.findDOMNode(this).parentNode;
            let scrollToBottom = Math.abs(elem.scrollTop - (elem.scrollHeight - elem.offsetHeight)) < 10;
            this.setState({ scrollToBottom }, () => {
                this.scrolling = false;
            });
        }, 500);
    }

    componentWillMount() {
        this.timer = setInterval(async () => {
            let response = await fetch("/api/util/logs", { credentials: 'same-origin' });
            let logs = await response.json()
            this.setState({ logs: logs.reverse() })
        }, 1000);
    }

    componentDidMount() {
        let elem = ReactDOM.findDOMNode(this).parentNode;
        elem.addEventListener("scroll", this._onScroll, false);
    }

    componentDidUpdate() {
        let elem = ReactDOM.findDOMNode(this).parentNode;
        if (!this.scrolling && this.state.scrollToBottom) {
            if (elem.scrollTop !== elem.scrollHeight - elem.offsetHeight) {
                elem.scrollTop = elem.scrollHeight - elem.offsetHeight;
            }
        }
    }

    componentWillUnmount() {
        let elem = ReactDOM.findDOMNode(this).parentNode;
        elem.removeEventListener("scroll", this._onScroll, false);
        clearTimeout(this.timer);
    }

    render() {
        let { logs } = this.state;
        return (
            <LoadingAndErrorWrapper loading={!logs || logs.length === 0}>
                {() =>
                    <div style={{ backgroundColor: "black", fontFamily: "monospace", fontSize: "14px", whiteSpace: "pre-line", padding: "0.5em" }}>
                        {reactAnsiStyle(React, logs.join("\n"))}
                    </div>
                }
            </LoadingAndErrorWrapper>
        );
    }
}
