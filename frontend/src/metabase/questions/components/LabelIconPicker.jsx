/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import S from "./LabelIconPicker.css";

import Icon from "metabase/components/Icon.jsx";
import LabelIcon from "metabase/components/LabelIcon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import { List } from "react-virtualized";
import "react-virtualized/styles.css";

import * as colors from "metabase/lib/colors";
import { categories } from "metabase/lib/emoji";

const ROW_HEIGHT = 45;
const VISIBLE_ROWS = 6;
const HEIGHT = VISIBLE_ROWS * ROW_HEIGHT;
const WIDTH = 330;

const ICONS_PER_ROW = 6;

const ROWS = [];
const CATEGORY_ROW_MAP = {};

function pushHeader(title) {
    ROWS.push({ type: "header", title: title });
}
function pushIcons(icons) {
    for (let icon of icons) {
        let current = ROWS[ROWS.length - 1];
        if (current.type !== "icons" || current.icons.length === ICONS_PER_ROW) {
            current = { type: "icons", icons: [] };
            ROWS.push(current);
        }
        current.icons.push(icon);
    }
}

// Colors
const ALL_COLORS = [].concat(...[colors.saturated, colors.normal, colors.desaturated].map(o => Object.values(o)));
pushHeader("Colors");
pushIcons(ALL_COLORS);

// Emoji
categories.map(category => {
    CATEGORY_ROW_MAP[category.id] = ROWS.length;
    pushHeader(category.name);
    pushIcons(category.emoji);
});

export default class LabelIconPicker extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            topIndex: 0,
            scrollToIndex: 0
        };
    }

    static propTypes = {
        value:      PropTypes.string,
        onChange:   PropTypes.func.isRequired,
    };

    scrollToCategory(id) {
        let categoryIndex = CATEGORY_ROW_MAP[id];
        if (categoryIndex > this.state.topIndex) {
            this.setState({ scrollToIndex: categoryIndex + VISIBLE_ROWS - 1 });
        } else {
            this.setState({ scrollToIndex: categoryIndex });
        }
    }

    render() {
        const { value, onChange } = this.props;
        return (
            <PopoverWithTrigger
                triggerElement={<LabelIconButton value={value} />}
                ref="popover"
            >
                <List
                  width={WIDTH}
                  height={HEIGHT}
                  rowCount={ROWS.length}
                  rowHeight={ROW_HEIGHT}
                  rowRenderer={ ({ index, key, style }) =>
                      ROWS[index].type === "header" ?
                          <div key={key} style={style} className={S.sectionHeader}>{ROWS[index].title}</div>
                      :
                          <ul key={key} style={style} className={S.list}>
                              { ROWS[index].icons.map(icon =>
                                  <li key={icon} className={S.option} onClick={() => { onChange(icon); this.refs.popover.close() }}>
                                      <LabelIcon icon={icon} size={28} />
                                  </li>
                              )}
                          </ul>
                  }
                  scrollToIndex={this.state.scrollToIndex}
                  onRowsRendered={({ overscanStartIndex, overscanStopIndex, startIndex, stopIndex }) => this.setState({ topIndex: startIndex })}
                />
                <ul className={S.sectionList} style={{ width: WIDTH }}>
                    { categories.map(category =>
                        <li key={category.id} className={S.category} onClick={() => this.scrollToCategory(category.id) }>
                          <Icon name={`emoji${category.id}`} />
                        </li>
                    )}
                </ul>
            </PopoverWithTrigger>
        );
    }
}

const LabelIconButton = ({ value = "#eee" }) =>
    <span className={S.dropdownButton}>
        <LabelIcon icon={value} size={28} />
        <Icon className={S.chevron} name="chevrondown" size={14} />
    </span>

LabelIconButton.propTypes = {
    value:      PropTypes.string
};
