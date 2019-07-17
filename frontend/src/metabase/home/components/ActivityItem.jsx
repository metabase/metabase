import React, { Component } from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";
import UserAvatar from "metabase/components/UserAvatar.jsx";
import colors from "metabase/lib/colors";

export default class ActivityItem extends Component {
  static propTypes = {
    item: PropTypes.object.isRequired,
    description: PropTypes.object.isRequired,
    userColors: PropTypes.string,
  };

  render() {
    const { item, description, userColors } = this.props;

    return (
      <div className="ml1 flex align-center mr2">
        <span>
          {item.user ? (
            <UserAvatar user={item.user} bg={userColors} />
          ) : (
            <IconBorder style={{ color: colors["text-light"] }}>
              <Icon name="sync" size={16} />
            </IconBorder>
          )}
        </span>

        <div className="ml2 full flex align-center">
          <div className="text-medium text-wrap">
            <span className="text-dark">{description.userName}</span>&nbsp;
            {description.summary}
          </div>
          <div className="flex-align-right text-right text-light">
            {description.timeSince}
          </div>
        </div>
      </div>
    );
  }
}
