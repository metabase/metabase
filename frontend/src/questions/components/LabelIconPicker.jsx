import React, { Component, PropTypes } from "react";

import S from "./LabelIconPicker.css";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import * as colors from "metabase/lib/colors";

import LabelIcon from "./LabelIcon.jsx";

const ALL_COLORS = [].concat(...[colors.saturated, colors.normal, colors.desaturated].map(o => Object.values(o)));


export default class LabelIconPicker extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    render() {
        const { value, onChange } = this.props;
        return (
            <PopoverWithTrigger
                triggerElement={<LabelIconButton value={value} />}
                ref="popover"
            >
                <div className={S.picker}>
                    <div>Colors</div>
                    <ul className={S.list}>
                    { ALL_COLORS.map(color =>
                        <li key={color} className={S.option} onClick={() => { onChange(color); this.refs.popover.close() }}>
                            <LabelIcon icon={color} size={28} />
                        </li>
                    )}
                    </ul>
                </div>
            </PopoverWithTrigger>
        );
    }
}

const LabelIconButton = ({ value = "#eee", onChange }) =>
    <span className={S.dropdownButton}>
        <LabelIcon icon={value} size={28} />
        <Icon className={S.chevron} name="chevrondown" width={14} height={14} />
    </span>
