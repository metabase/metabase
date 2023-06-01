/* eslint-disable react/prop-types */
import { createRef, Component } from "react";

import { t } from "ttag";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Tooltip from "metabase/core/components/Tooltip";
import ClockIcon from "metabase/components/icons/ClockIcon";
import CountdownIcon from "metabase/components/icons/CountdownIcon";

import { DashboardHeaderButton } from "metabase/dashboard/containers/DashboardHeader.styled";
import {
  RefreshOptionIcon,
  RefreshOptionItem,
  RefreshWidgetPopover,
  RefreshWidgetTitle,
} from "./RefreshWidget.styled";

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
  constructor(props) {
    super(props);

    this.popover = createRef();
  }
  state = { elapsed: null };

  UNSAFE_componentWillMount() {
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
    const { period, onChangePeriod, className } = this.props;
    const { elapsed } = this.state;
    const remaining = period - elapsed;
    return (
      <PopoverWithTrigger
        ref={this.popover}
        triggerElement={
          elapsed == null ? (
            <Tooltip tooltip={t`Auto-refresh`}>
              <DashboardHeaderButton
                icon={
                  <ClockIcon width={16} height={16} className={className} />
                }
              />
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
              <DashboardHeaderButton
                icon={
                  <CountdownIcon
                    width={16}
                    height={16}
                    percent={Math.min(0.95, (period - elapsed) / period)}
                  />
                }
              />
            </Tooltip>
          )
        }
        targetOffsetY={10}
      >
        <RefreshWidgetPopover>
          <RefreshWidgetTitle>{t`Auto Refresh`}</RefreshWidgetTitle>
          <RefreshOptionList>
            {OPTIONS.map(option => (
              <RefreshOption
                key={option.period}
                name={option.name}
                period={option.period}
                selected={option.period === period}
                onClick={() => {
                  this.popover.current.close();
                  onChangePeriod(option.period);
                }}
              />
            ))}
          </RefreshOptionList>
        </RefreshWidgetPopover>
      </PopoverWithTrigger>
    );
  }
}

const RefreshOptionList = ({ children }) => <ul>{children}</ul>;

const RefreshOption = ({ name, period, selected, onClick }) => (
  <RefreshOptionItem
    isEnabled={period != null}
    isSelected={selected}
    onClick={onClick}
  >
    <RefreshOptionIcon name="check" size={14} />
    <span>{name.split(" ")[0]}</span>
    <span>{name.split(" ")[1]}</span>
  </RefreshOptionItem>
);
