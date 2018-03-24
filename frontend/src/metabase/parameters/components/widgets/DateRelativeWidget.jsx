import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import cx from "classnames";
import _ from "underscore";

const SHORTCUTS = [
  {
    name: t`Today`,
    operator: ["=", "<", ">"],
    values: [["relative-datetime", "current"]],
  },
  {
    name: t`Yesterday`,
    operator: ["=", "<", ">"],
    values: [["relative-datetime", -1, "day"]],
  },
  { name: t`Past 7 days`, operator: "time-interval", values: [-7, "day"] },
  { name: t`Past 30 days`, operator: "time-interval", values: [-30, "day"] },
];

const RELATIVE_SHORTCUTS = {
  Last: [
    { name: t`Week`, operator: "time-interval", values: ["last", "week"] },
    { name: t`Month`, operator: "time-interval", values: ["last", "month"] },
    { name: t`Year`, operator: "time-interval", values: ["last", "year"] },
  ],
  This: [
    { name: t`Week`, operator: "time-interval", values: ["current", "week"] },
    { name: t`Month`, operator: "time-interval", values: ["current", "month"] },
    { name: t`Year`, operator: "time-interval", values: ["current", "year"] },
  ],
};

export class PredefinedRelativeDatePicker extends Component {
  constructor(props, context) {
    super(props, context);

    _.bindAll(this, "isSelectedShortcut", "onSetShortcut");
  }

  static propTypes = {
    filter: PropTypes.array.isRequired,
    onFilterChange: PropTypes.func.isRequired,
  };

  isSelectedShortcut(shortcut) {
    let { filter } = this.props;
    return (
      (Array.isArray(shortcut.operator)
        ? _.contains(shortcut.operator, filter[0])
        : filter[0] === shortcut.operator) &&
      _.isEqual(filter.slice(2), shortcut.values)
    );
  }

  onSetShortcut(shortcut) {
    let { filter } = this.props;
    let operator;
    if (Array.isArray(shortcut.operator)) {
      if (_.contains(shortcut.operator, filter[0])) {
        operator = filter[0];
      } else {
        operator = shortcut.operator[0];
      }
    } else {
      operator = shortcut.operator;
    }
    this.props.onFilterChange([operator, filter[1], ...shortcut.values]);
  }

  render() {
    return (
      <div className="p1 pt2">
        <section>
          {SHORTCUTS.map((s, index) => (
            <span
              key={index}
              className={cx("inline-block half pb1", { pr1: index % 2 === 0 })}
            >
              <button
                key={index}
                className={cx(
                  "Button Button-normal Button--medium text-normal text-centered full",
                  { "Button--purple": this.isSelectedShortcut(s) },
                )}
                onClick={() => this.onSetShortcut(s)}
              >
                {s.name}
              </button>
            </span>
          ))}
        </section>
        {Object.keys(RELATIVE_SHORTCUTS).map(sectionName => (
          <section key={sectionName}>
            <div
              style={{}}
              className="border-bottom text-uppercase flex layout-centered mb2"
            >
              <h6
                style={{
                  position: "relative",
                  backgroundColor: "white",
                  top: "6px",
                }}
                className="px2"
              >
                {sectionName}
              </h6>
            </div>
            <div className="flex">
              {RELATIVE_SHORTCUTS[sectionName].map((s, index) => (
                <button
                  key={index}
                  data-ui-tag={
                    "relative-date-shortcut-" +
                    sectionName.toLowerCase() +
                    "-" +
                    s.name.toLowerCase()
                  }
                  className={cx(
                    "Button Button-normal Button--medium flex-full mb1",
                    {
                      "Button--purple": this.isSelectedShortcut(s),
                      mr1: index !== RELATIVE_SHORTCUTS[sectionName].length - 1,
                    },
                  )}
                  onClick={() => this.onSetShortcut(s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }
}

// HACK: easiest way to get working with RelativeDatePicker
const FILTERS = {
  today: {
    name: t`Today`,
    mapping: ["=", null, ["relative-datetime", "current"]],
  },
  yesterday: {
    name: t`Yesterday`,
    mapping: ["=", null, ["relative-datetime", -1, "day"]],
  },
  past7days: {
    name: t`Past 7 Days`,
    mapping: ["time-interval", null, -7, "day"],
  },
  past30days: {
    name: t`Past 30 Days`,
    mapping: ["time-interval", null, -30, "day"],
  },
  lastweek: {
    name: t`Last Week`,
    mapping: ["time-interval", null, "last", "week"],
  },
  lastmonth: {
    name: t`Last Month`,
    mapping: ["time-interval", null, "last", "month"],
  },
  lastyear: {
    name: t`Last Year`,
    mapping: ["time-interval", null, "last", "year"],
  },
  thisweek: {
    name: t`This Week`,
    mapping: ["time-interval", null, "current", "week"],
  },
  thismonth: {
    name: t`This Month`,
    mapping: ["time-interval", null, "current", "month"],
  },
  thisyear: {
    name: t`This Year`,
    mapping: ["time-interval", null, "current", "year"],
  },
};

export default class DateRelativeWidget extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {};
  }

  static propTypes = {};
  static defaultProps = {};

  static format = value => (FILTERS[value] ? FILTERS[value].name : "");

  render() {
    const { value, setValue, onClose } = this.props;
    return (
      <div className="px1" style={{ maxWidth: 300 }}>
        <PredefinedRelativeDatePicker
          filter={FILTERS[value] ? FILTERS[value].mapping : [null, null]}
          onFilterChange={filter => {
            setValue(_.findKey(FILTERS, f => _.isEqual(f.mapping, filter)));
            onClose();
          }}
        />
      </div>
    );
  }
}
