import React, { Component } from "react";
import styles from "./RefreshWidget.css";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import Icon from "metabase/components/Icon.jsx";
import ClockIcon from "metabase/components/icons/ClockIcon.jsx";
import CountdownIcon from "metabase/components/icons/CountdownIcon.jsx";
import { t } from "c-3po";
import cx from "classnames";

const OPTIONS = [
  { name: t`Off`, period: null },
  { name: t`1 minute`, period: 1 * 60 },
  { name: t`5 minutes`, period: 5 * 60 },
  { name: t`10 minutes`, period: 10 * 60 },
  { name: t`15 minutes`, period: 15 * 60 },
  { name: t`30 minutes`, period: 30 * 60 },
  { name: t`60 minutes`, period: 60 * 60 },
];

export default class RefreshWidget extends Component {
  render() {
    const { period, elapsed, onChangePeriod, className } = this.props;
    const remaining = period - elapsed;
    return (
      <PopoverWithTrigger
        ref="popover"
        triggerElement={
          elapsed == null ? (
            <Tooltip tooltip={t`Auto-refresh`}>
              <ClockIcon width={18} height={18} className={className} />
            </Tooltip>
          ) : (
            <Tooltip
              tooltip={
                t`Refreshing in` +
                " " +
                Math.floor(remaining / 60) +
                ":" +
                (remaining % 60 < 10 ? "0" : "") +
                Math.round(remaining % 60)
              }
            >
              <CountdownIcon
                width={18}
                height={18}
                className="text-green"
                percent={Math.min(0.95, (period - elapsed) / period)}
              />
            </Tooltip>
          )
        }
        targetOffsetY={10}
      >
        <div className={styles.popover}>
          <div className={styles.title}>Auto Refresh</div>
          <RefreshOptionList>
            {OPTIONS.map(option => (
              <RefreshOption
                key={option.period}
                name={option.name}
                period={option.period}
                selected={option.period === period}
                onClick={() => {
                  this.refs.popover.close();
                  onChangePeriod(option.period);
                }}
              />
            ))}
          </RefreshOptionList>
        </div>
      </PopoverWithTrigger>
    );
  }
}

const RefreshOptionList = ({ children }) => <ul>{children}</ul>;

const RefreshOption = ({ name, period, selected, onClick }) => (
  <li
    className={cx(styles.option, styles[period == null ? "off" : "on"], {
      [styles.selected]: selected,
    })}
    onClick={onClick}
  >
    <Icon name="check" size={14} />
    <span className={styles.name}>{name.split(" ")[0]}</span>
    <span className={styles.nameSuffix}> {name.split(" ")[1]}</span>
  </li>
);
