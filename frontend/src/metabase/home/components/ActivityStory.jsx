import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { color } from "metabase/lib/colors";

export default class ActivityStory extends Component {
  constructor(props, context) {
    super(props, context);

    this.styles = {
      borderWidth: "2px",
      borderColor: color("border"),
    };
  }

  static propTypes = {
    story: PropTypes.object.isRequired,
  };

  render() {
    const { story } = this.props;

    if (!story.body) {
      return null;
    }

    return (
      <div
        className="mt1 border-left flex mr2"
        style={{
          borderWidth: "3px",
          marginLeft: "22px",
          borderColor: color("border"),
        }}
      >
        <div className="flex full ml4 bordered rounded p2" style={this.styles}>
          {story.bodyLink ? (
            <Link
              to={story.bodyLink}
              data-metabase-event={"Activity Feed;Story Clicked;" + story.topic}
              className="link text-wrap"
            >
              {story.body}
            </Link>
          ) : (
            <span>{story.body}</span>
          )}
        </div>
      </div>
    );
  }
}
