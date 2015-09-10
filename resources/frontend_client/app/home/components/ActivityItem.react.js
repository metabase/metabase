'use strict';

import React, { Component } from 'react';
import Icon from 'metabase/components/Icon.react';
import ActivityDescription from './ActivityDescription.react';

export default class ActivityItem extends Component {
    constructor() {
        super()
        this.styles = {
            initials: {
                borderRadius: '0px',
            }
        }
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
        const { item, description, userColors } = this.props
        return (
            <div className="flex align-center">
                { item.user ?
                    <span styles={this.styles.initials} className={userColors}>
                        <span className="UserInitials">{this.userInitials(item.user)}</span>
                    </span>
                :
                    <span styles={this.styles.initials} className={userColors}>
                        <span className="UserInitials"><Icon name={'return'}></Icon></span>
                    </span>
                }
                <ActivityDescription description={description} />
            </div>
        )
    }
}
