'use strict';

import React, { Component } from 'react';

import Icon from 'metabase/components/Icon.react';


export default class ActivityItem extends Component {

    constructor(props) {
        super(props);

        this.styles = {
            initials: {
                borderRadius: '0px',
            }
        };
    }

    userInitials(user) {
        let initials = '??';

        if (user.first_name !== 'undefined') {
            initials = user.first_name.substring(0, 1);
        }

        if (user.last_name !== 'undefined') {
            initials = initials + user.last_name.substring(0, 1);
        }

        return initials;
    }

    render() {
        const { item, description, userColors } = this.props;

        return (
            <div className="flex align-center">
                { item.user ?
                    <span styles={this.styles.initials} className={userColors}>
                        <span className="UserInitials">{this.userInitials(item.user)}</span>
                    </span>
                :
                    <span styles={this.styles.initials} className={userColors}>
                        <span className="UserInitials"><Icon name='sync' width={16} height={16} /></span>
                    </span>
                }

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
            </div>
        )
    }
}
