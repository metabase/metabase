"use strict";

import React, { Component, PropTypes } from "react";

export default class ActivityDescription extends Component {

    constructor(props) {
        super(props);
    }

    render() {
        let { description } = this.props;
        return (
            <div className="ml2 full flex align-center">
                <div className="text-grey-4">
                    <span className="text-dark">{description.userName}</span>

                    &nbsp;{description.subject}&nbsp;

                    { description.subjectRefName && description.subjectRefLink ?
                        <a className="link text-dark" href={description.subjectRefLink}>{description.subjectRefName}</a>
                    : null }

                    { description.subjectRefName && !description.subjectRefLink ?
                        <span className="text-dark">{description.subjectRefName}</span>
                    : null }
                </div>
                <div className="flex-align-right text-right text-grey-2">
                    {description.timeSince}
                </div>
            </div>
        );
    }
}
