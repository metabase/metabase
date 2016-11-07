import React from "react";

import cx from "classnames";
import _ from "underscore";

const SettingToggle = ({ setting, updateSetting, disabled }) => {
    var options = _.map(setting.options, (name, value) => {
        var classes = cx("h3", "text-bold", "text-brand-hover", "no-decoration",  { "text-brand": setting.value === value });
        return (
            <li className="mr3" key={value}>
                <a className={classes} href="#" onClick={() => updateSetting(value)}>{name}</a>
            </li>
        );
    });
    return <ul className="flex text-grey-4">{options}</ul>
}

export default SettingToggle;
