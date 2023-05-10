import React from "react";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";

import { DATE_MBQL_FILTER_MAPPING } from "metabase-lib/parameters/constants";

type Shortcut = {
  name: string;
  operator: string | string[];
  values: any[];
};

type ShortcutMap = {
  [name: string]: Shortcut[];
};

const SHORTCUTS: Shortcut[] = [
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

const RELATIVE_SHORTCUTS: ShortcutMap = {
  [t`Last`]: [
    { name: t`Week`, operator: "time-interval", values: ["last", "week"] },
    { name: t`Month`, operator: "time-interval", values: ["last", "month"] },
    { name: t`Year`, operator: "time-interval", values: ["last", "year"] },
  ],
  [t`This`]: [
    { name: t`Week`, operator: "time-interval", values: ["current", "week"] },
    { name: t`Month`, operator: "time-interval", values: ["current", "month"] },
    { name: t`Year`, operator: "time-interval", values: ["current", "year"] },
  ],
};

type PredefinedRelativeDatePickerProps = {
  filter: any[];
  onFilterChange: (filter: any[]) => void;
};

export class PredefinedRelativeDatePicker extends React.Component<PredefinedRelativeDatePickerProps> {
  constructor(props: PredefinedRelativeDatePickerProps) {
    super(props);

    _.bindAll(this, "isSelectedShortcut", "onSetShortcut");
  }

  isSelectedShortcut(shortcut: Shortcut) {
    const { filter } = this.props;
    return (
      (Array.isArray(shortcut.operator)
        ? _.contains(shortcut.operator, filter[0])
        : filter[0] === shortcut.operator) &&
      _.isEqual(filter.slice(2), shortcut.values)
    );
  }

  onSetShortcut(shortcut: Shortcut) {
    const { filter } = this.props;
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
                aria-selected={this.isSelectedShortcut(s)}
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
                  aria-selected={this.isSelectedShortcut(s)}
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

type DateRelativeWidgetProps = {
  value: string;
  setValue: (v?: string) => void;
  onClose: () => void;
};

class DateRelativeWidget extends React.Component<DateRelativeWidgetProps> {
  constructor(props: DateRelativeWidgetProps) {
    super(props);
  }

  render() {
    const { value, setValue, onClose } = this.props;
    return (
      <div className="px1" style={{ maxWidth: 300 }}>
        <PredefinedRelativeDatePicker
          filter={
            DATE_MBQL_FILTER_MAPPING[value]
              ? DATE_MBQL_FILTER_MAPPING[value].mapping
              : [null, null]
          }
          onFilterChange={filter => {
            setValue(
              _.findKey(DATE_MBQL_FILTER_MAPPING, f =>
                _.isEqual(f.mapping, filter),
              ),
            );
            onClose();
          }}
        />
      </div>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DateRelativeWidget;
