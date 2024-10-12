import cx from "classnames";
import { Component } from "react";
import { ngettext, msgid, t } from "ttag";
import _ from "underscore";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { DATE_MBQL_FILTER_MAPPING } from "metabase-lib/v1/parameters/constants";

import DateRelativeWidgetStyle from "./DateRelativeWidget.module.css";

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
  { name: t`Previous 7 days`, operator: "time-interval", values: [-7, "day"] },
  {
    name: t`Previous 30 days`,
    operator: "time-interval",
    values: [-30, "day"],
  },
];

const RELATIVE_SHORTCUTS: ShortcutMap = {
  // these have to be plural because they're plural elsewhere and they cannot be both a singular message ID and a
  // plural message ID
  [t`Last`]: [
    {
      name: ngetext(msgid`Week`, `Weeks`, 1),
      operator: "time-interval",
      values: ["last", "week"],
    },
    {
      name: ngetext(msgid`Month`, `Months`, 1),
      operator: "time-interval",
      values: ["last", "month"],
    },
    {
      name: ngetext(msgid`Year`, `Years`, 1),
      operator: "time-interval",
      values: ["last", "year"],
    },
  ],
  [t`This`]: [
    {
      name: ngetext(msgid`Week`, `Weeks`, 1),
      operator: "time-interval",
      values: ["current", "week"],
    },
    {
      name: ngetext(msgid`Month`, `Months`, 1),
      operator: "time-interval",
      values: ["current", "month"],
    },
    {
      name: ngetext(msgid`Year`, `Years`, 1),
      operator: "time-interval",
      values: ["current", "year"],
    },
  ],
};

type PredefinedRelativeDatePickerProps = {
  filter: any[];
  onFilterChange: (filter: any[]) => void;
};

export class PredefinedRelativeDatePicker extends Component<PredefinedRelativeDatePickerProps> {
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
      <div className={cx(CS.p1, CS.pt2)}>
        <section>
          {SHORTCUTS.map((s, index) => (
            <span
              key={index}
              className={cx(CS.inlineBlock, CS.half, CS.pb1, {
                [CS.pr1]: index % 2 === 0,
              })}
            >
              <button
                key={index}
                aria-selected={this.isSelectedShortcut(s)}
                className={cx(
                  ButtonsS.Button,
                  ButtonsS.ButtonNormal,
                  ButtonsS.ButtonMedium,
                  CS.full,
                  DateRelativeWidgetStyle.shortcut,
                  {
                    [DateRelativeWidgetStyle.shortcutSelected]:
                      this.isSelectedShortcut(s),
                  },
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
            <fieldset
              className={cx(
                CS.textUppercase,
                CS.flex,
                CS.layoutCentered,
                DateRelativeWidgetStyle.sectionLine,
              )}
            >
              <legend className={DateRelativeWidgetStyle.sectionLabel}>
                {sectionName}
              </legend>
            </fieldset>
            <div className={CS.flex}>
              {RELATIVE_SHORTCUTS[sectionName].map((shortcut, index) => (
                <button
                  key={index}
                  aria-selected={this.isSelectedShortcut(shortcut)}
                  data-ui-tag={
                    "relative-date-shortcut-" +
                    sectionName.toLowerCase() +
                    "-" +
                    shortcut.name.toLowerCase()
                  }
                  className={cx(
                    ButtonsS.Button,
                    ButtonsS.ButtonNormal,
                    ButtonsS.ButtonMedium,
                    CS.full,
                    CS.mb1,
                    DateRelativeWidgetStyle.shortcut,
                    {
                      [CS.mr1]:
                        index !== RELATIVE_SHORTCUTS[sectionName].length - 1,
                      [DateRelativeWidgetStyle.shortcutSelected]:
                        this.isSelectedShortcut(shortcut),
                    },
                  )}
                  onClick={() => this.onSetShortcut(shortcut)}
                >
                  {shortcut.name}
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

export class DateRelativeWidget extends Component<DateRelativeWidgetProps> {
  render() {
    const { value, setValue, onClose } = this.props;
    return (
      <div className={CS.px1} style={{ maxWidth: 300 }}>
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
