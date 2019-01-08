import React from "react";

import _ from "underscore";
import cx from "classnames";

import Icon from "metabase/components/Icon";

import visualizations from "metabase/visualizations";

const ICON_SIZE = 22;

function getDisplayPickerGroups() {
  const groups = [
    { icon: "table", visualizations: ["table"] },
    {
      icon: "lineandbar",
      visualizations: ["line", "area", "bar", "combo", "scatter", "row"],
    },
    { icon: "pinmap", visualizations: ["map"] },
    { icon: "pie", visualizations: [] }, // everything else
  ];

  const used = new Set();
  for (const group of groups) {
    for (const name of group.visualizations) {
      used.add(name);
    }
  }

  const other = groups[groups.length - 1];
  for (const [name, viz] of visualizations) {
    if (!used.has(name) && !viz.hidden) {
      other.visualizations.push(name);
    }
  }

  return groups;
}

const DISPLAY_PICKER_GROUPS = getDisplayPickerGroups();

export default class DisplayPicker extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      group: props.value
        ? _.find(DISPLAY_PICKER_GROUPS, group =>
            group.visualizations.includes(props.value),
          )
        : null,
    };
  }

  handleChange(viz) {
    const { onChange } = this.props;
    onChange(viz.identifier);
  }

  handleChangeGroup(group) {
    const { onChange } = this.props;
    if (group && group.visualizations.length === 1) {
      onChange(group.visualizations[0]);
    } else {
      this.setState({ group });
    }
  }

  render() {
    const { value, showSettings, onToggleSettings } = this.props;
    const { group } = this.state;
    if (group && group.visualizations.length > 1) {
      return (
        <RoundButtonBar>
          <RoundButtonBarBackButton
            onClick={() => this.handleChangeGroup(null)}
          />
          {group.visualizations.map(name => {
            const viz = visualizations.get(name);
            if (viz && !viz.hidden) {
              return (
                <RoundButtonBarButton
                  icon={viz.iconName}
                  onClick={() => this.handleChange(viz)}
                  selected={viz.identifier === value}
                />
              );
            }
          })}
          {onToggleSettings && (
            <RoundButtonBarSettingsButton
              selected={showSettings}
              onClick={onToggleSettings}
            />
          )}
        </RoundButtonBar>
      );
    } else {
      const selectedGroup = _.find(
        DISPLAY_PICKER_GROUPS,
        group => group.visualizations.indexOf(value) >= 0, // OPTIMIZE
      );
      return (
        <RoundButtonBar>
          {DISPLAY_PICKER_GROUPS.map(group => {
            return (
              <RoundButtonBarButton
                icon={group.icon}
                onClick={() => this.handleChangeGroup(group)}
                selected={group === selectedGroup}
              />
            );
          })}
          {onToggleSettings && (
            <RoundButtonBarSettingsButton
              selected={showSettings}
              onClick={onToggleSettings}
            />
          )}
        </RoundButtonBar>
      );
    }
  }
}

const RoundButtonBar = ({ children }) => (
  <div className="circular p1 px2 bg-black text-white flex align-center">
    {children}
  </div>
);

const RoundButtonBarButton = ({ icon, selected, onClick }) => (
  <Icon
    size={ICON_SIZE}
    name={icon}
    onClick={onClick}
    className={cx(
      "p1 text-brand-hover cursor-pointer",
      selected ? "text-white" : "text-medium",
    )}
  />
);

const RoundButtonBarBackButton = ({ onClick }) => (
  <Icon
    name="chevronleft"
    onClick={onClick}
    className={cx(
      "mr1 p1 text-brand-hover circular bg-dark text-white cursor-pointer",
    )}
  />
);

const RoundButtonBarSettingsButton = ({ onClick, selected }) => (
  <Icon
    size={ICON_SIZE}
    name="gear"
    onClick={onClick}
    className={cx(
      "ml1 p1 border-left text-brand-hover cursor-pointer",
      selected ? "text-white" : "text-medium",
    )}
  />
);
