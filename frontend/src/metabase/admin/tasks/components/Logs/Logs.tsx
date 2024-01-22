import { Component } from "react";
import * as React from "react";
import reactAnsiStyle from "react-ansi-style";

import _ from "underscore";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import { t } from "ttag";
import type { Log } from "metabase-types/api";

import { UtilApi } from "metabase/services";

import Select, { Option } from "metabase/core/components/Select";
import { LogsContainer, LogsContent } from "./Logs.styled";

const MAX_LOGS = 50000;

function logEventKey(ev: Log) {
  return `${ev.timestamp}, ${ev.process_uuid}, ${ev.fqns}, ${ev.msg}`;
}

function mergeLogs(...logArrays: Log[] | Log[][]) {
  return _.chain(logArrays)
    .flatten(true)
    .sortBy(ev => ev.msg)
    .sortBy(ev => ev.process_uuid)
    .sortBy(ev => ev.timestamp)
    .uniq(true, logEventKey)
    .last(MAX_LOGS)
    .value();
}

type LogsProps = Record<string, never>;

interface LogsState {
  loaded: boolean;
  error: string | null;
  logs: Log[];
  selectedProcessUUID: string;
}

export class Logs extends Component<LogsProps, LogsState> {
  constructor(props: LogsProps) {
    super(props);
    this.state = {
      loaded: false,
      error: null,
      logs: [],
      selectedProcessUUID: "ALL",
    };
  }

  timer: NodeJS.Timeout | null = null;
  scrollRef: React.RefObject<HTMLDivElement> = React.createRef();
  unmounted = false;
  shouldTail = true;

  componentDidMount() {
    this.fetchLogs();
    this.timer = setInterval(this.fetchLogs, 1000);
  }

  componentWillUnmount() {
    this.unmounted = true;
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  fetchLogs = async () => {
    try {
      const logs = await UtilApi.logs();
      if (!this.unmounted) {
        this.setState({
          loaded: true,
          logs: mergeLogs(this.state.logs, logs.reverse()),
        });
        this.maybeTail();
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.data?.message ?? err.messsage ?? t`An error occurred.`;
      !this.unmounted && this.setState({ error: msg });
    }
  };

  _onScroll = () => {
    const elem = this.scrollRef.current;
    if (elem) {
      this.shouldTail = elem.scrollTop >= elem.scrollHeight - elem.offsetHeight;
    }
  };

  maybeTail = () => {
    const elem = this.scrollRef.current;
    if (this.shouldTail && elem) {
      elem.scrollTop = elem.scrollHeight;
    }
  };

  render() {
    const { logs, selectedProcessUUID, error, loaded } = this.state;
    const filteredLogs = logs.filter(
      ev =>
        !selectedProcessUUID ||
        selectedProcessUUID === "ALL" ||
        ev.process_uuid === selectedProcessUUID,
    );
    const processUUIDs = _.uniq(
      logs.map(ev => ev.process_uuid).filter(Boolean),
    ).sort();
    const renderedLogs = filteredLogs.flatMap(ev => {
      const timestamp = moment(ev.timestamp).format();
      const uuid = ev.process_uuid || "---";
      return [
        `[${uuid}] ${timestamp} ${ev.level} ${ev.fqns} ${ev.msg}`,
        ...(ev.exception || []),
      ];
    });

    const noResults = !filteredLogs || filteredLogs.length === 0;
    const resultText = noResults
      ? t`There's nothing here, yet.`
      : renderedLogs.join("\n");

    return (
      <LogsContainer loading={!loaded} error={error}>
        {() => (
          <>
            {processUUIDs.length > 1 && (
              <div className="pb1">
                <label>{t`Select Metabase process:`}</label>
                <Select
                  defaultValue="ALL"
                  value={this.state.selectedProcessUUID}
                  onChange={(e: { target: { value: string } }) =>
                    this.setState({ selectedProcessUUID: e.target.value })
                  }
                  className="inline-block ml1"
                  width={400}
                >
                  <Option
                    value="ALL"
                    key="ALL"
                  >{t`All Metabase processes`}</Option>
                  {processUUIDs.map(uuid => (
                    <Option key={uuid} value={uuid}>
                      <code>{uuid}</code>
                    </Option>
                  ))}
                </Select>
              </div>
            )}

            <LogsContent
              id="logs-content"
              ref={this.scrollRef}
              onScroll={this._onScroll}
            >
              {reactAnsiStyle(React, resultText)}
            </LogsContent>
          </>
        )}
      </LogsContainer>
    );
  }
}
