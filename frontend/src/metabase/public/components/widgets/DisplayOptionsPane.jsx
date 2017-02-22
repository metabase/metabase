/* @flow */

import React, { Component, PropTypes } from "react";

import EmbedSelect from "./EmbedSelect";
import CheckBox from "metabase/components/CheckBox";

import type { DisplayOptions } from "./EmbedModalContent";

type Props = {
    className?: string,
    displayOptions: DisplayOptions,
    onChangeDisplayOptions: (displayOptions: DisplayOptions) => void
}

const THEME_OPTIONS = [
    { name: "Light", value: null, icon: "sun" },
    { name: "Dark", value: "night", icon: "moon" }
];

const DisplayOptionsPane = ({ className, displayOptions, onChangeDisplayOptions }: Props) =>
    <div className={className}>
        <div className="flex align-center my1">
            <CheckBox
                checked={displayOptions.bordered}
                onChange={(e) => onChangeDisplayOptions({ ...displayOptions, bordered: e.target.checked })}
            />
            <span className="ml1">Bordered</span>
        </div>
        <EmbedSelect
            value={displayOptions.theme}
            options={THEME_OPTIONS}
            onChange={(value) => onChangeDisplayOptions({ ...displayOptions, theme: value })}
        />
    </div>;

export default DisplayOptionsPane;
