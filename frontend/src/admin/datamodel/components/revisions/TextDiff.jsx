/*eslint-env node */

import React, { Component, PropTypes } from "react";

import { diffWords } from 'diff';

export default class TextDiff extends Component {
    static propTypes = {
        diff: PropTypes.object.isRequired
    };

    render() {
        let { diff: { before, after }} = this.props;
        return (
            <div>
                "
                {before != null &&  after != null ?
                    diffWords(before, after).map((section, index) =>
                        <span>
                        {section.added ?
                            <strong key={index}>{section.value}</strong>
                        : section.removed ?
                            <span key={index} style={{ textDecoration: "line-through"}}>{section.value}</span>
                        :
                            <span key={index}>{section.value}</span>
                        }{" "}
                        </span>
                    )
                : before != null ?
                    <span style={{ textDecoration: "line-through"}}>{before}</span>
                :
                    <strong>{after}</strong>
                }
                "
            </div>
        );
    }
}
