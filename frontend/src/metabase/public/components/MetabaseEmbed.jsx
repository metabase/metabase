import React, { Component } from "react";

import querystring from "querystring";
import _ from "underscore";

const OPTION_NAMES = ["bordered"];

export default class MetabaseEmbed extends Component {
    render() {
        let { className, style, url } = this.props;

        let options = querystring.stringify(_.pick(this.props, ...OPTION_NAMES));
        if (options) {
            url += "#" + options;
        }

        return (
            <iframe
                src={url}
                className={className}
                style={{ backgroundColor: "transparent", ...style }}
                frameBorder={0}
                allowTransparency
            />
        );
    }
}
