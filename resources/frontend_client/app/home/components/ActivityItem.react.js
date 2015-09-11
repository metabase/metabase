'use strict';

import React, { Component, PropTypes } from 'react';
import Icon from 'metabase/components/Icon.react';
import IconBorder from 'metabase/components/IconBorder.react';
import UserAvatar from 'metabase/components/UserAvatar.react';

export default class ActivityItem extends Component {
    render() {
        const { item, description, userColors } = this.props;

        return (
            <div className="ml1 flex align-center mr2">
                <span>
                    { item.user ?
                        <UserAvatar user={item.user} background={userColors} style={{color: '#fff', borderWidth: '0'}}/>
                    :
                        <IconBorder style={{color: '#B8C0C8'}}>
                            <Icon name='sync' width={16} height={16} />
                        </IconBorder>
                    }
                </span>

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

ActivityItem.propTypes = {
    item: PropTypes.object.isRequired,
    description: PropTypes.object.isRequired,
    userColors: PropTypes.string
}
