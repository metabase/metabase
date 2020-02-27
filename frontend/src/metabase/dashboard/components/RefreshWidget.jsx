import React, { Component } from "react";
import styles from "./RefreshWidget.css";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Tooltip from "metabase/components/Tooltip";
import Icon from "metabase/components/Icon";
import ClockIcon from "metabase/components/icons/ClockIcon";
import CountdownIcon from "metabase/components/icons/CountdownIcon";
import { t } from "ttag";
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
  state = { elapsed: null };

  componentWillMount() {
    const { setRefreshElapsedHook } = this.props;
    if (setRefreshElapsedHook) {
      setRefreshElapsedHook(elapsed => this.setState({ elapsed }));
    }
  }

  componentDidUpdate(prevProps) {
    const { setRefreshElapsedHook } = this.props;
    if (
      setRefreshElapsedHook &&
      prevProps.setRefreshElapsedHook !== setRefreshElapsedHook
    ) {
      setRefreshElapsedHook(elapsed => this.setState({ elapsed }));
    }
  }

  render() {
    const { period, onChangePeriod } = this.props;
    const { elapsed } = this.state;
    //const remaining = period - elapsed;
    return (
      <RefreshOptionList>
        {OPTIONS.map(option => (
          <RefreshOption
            key={option.period}
            name={option.name}
            period={option.period}
            selected={option.period === period}
            onClick={() => {
              onChangePeriod(option.period);
            }}
          />
        ))}
      </RefreshOptionList>
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
