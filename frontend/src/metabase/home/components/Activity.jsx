import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import _ from "underscore";
import { t } from "c-3po";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import ActivityItem from "./ActivityItem.jsx";
import ActivityStory from "./ActivityStory.jsx";

import * as Urls from "metabase/lib/urls";

export default class Activity extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = { error: null, userColors: {} };

    this.colorClasses = [
      "bg-brand",
      "bg-purple",
      "bg-error",
      "bg-green",
      "bg-gold",
      "bg-medium",
    ];
  }

  static propTypes = {
    user: PropTypes.object.isRequired,
    activity: PropTypes.array,
    fetchActivity: PropTypes.func.isRequired,
  };

  async componentDidMount() {
    try {
      await this.props.fetchActivity();
    } catch (error) {
      this.setState({ error });
    }
  }

  componentWillReceiveProps(nextProps) {
    // do a quick pass over the activity and make sure we've assigned colors to all users which have activity
    let { activity, user } = nextProps;
    let { userColors } = this.state;

    const colors = [1, 2, 3, 4, 5];
    const maxColorUsed = _.isEmpty(userColors)
      ? 0
      : _.max(_.values(userColors));
    let currColor =
      maxColorUsed && maxColorUsed < colors.length ? maxColorUsed : 0;

    if (user && activity) {
      for (let item of activity) {
        if (!(item.user_id in userColors)) {
          // assign the user a color
          if (item.user_id === user.id) {
            userColors[item.user_id] = 0;
          } else if (item.user_id === null) {
            // just skip this scenario, we handle this differently
          } else {
            userColors[item.user_id] = colors[currColor];
            currColor++;

            // if we hit the end of the colors list then just go back to the beginning again
            if (currColor >= colors.length) {
              currColor = 0;
            }
          }
        }
      }
    }

    this.setState({ userColors });
  }

  userName(user, currentUser) {
    if (user && currentUser && user.id === currentUser.id) {
      return t`You`;
    } else if (user) {
      return user.first_name;
    } else {
      return "Metabase";
    }
  }

  activityHeader(item, user) {
    // this is a base to start with
    const description = {
      userName: this.userName(item.user, user),
      summary: t`did some super awesome stuff that's hard to describe`,
      timeSince: item.timestamp.fromNow(),
    };

    switch (item.topic) {
      case "alert-create":
        if (item.model_exists) {
          description.summary = (
            <span>
              {t`created an alert about - `}
              <Link
                to={Urls.modelToUrl(item.model, item.model_id)}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Database -> " + item.topic
                }
                className="link text-dark"
              >
                {item.details.name}
              </Link>
            </span>
          );
        } else {
          description.summary = (
            <span>
              {t`created an alert about - `}
              <span className="text-dark">{item.details.name}</span>
            </span>
          );
        }
        break;
      case "alert-delete":
        if (item.model_exists) {
          description.summary = (
            <span>
              {t`deleted an alert about - `}
              <Link
                to={Urls.modelToUrl(item.model, item.model_id)}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Database -> " + item.topic
                }
                className="link text-dark"
              >
                {item.details.name}
              </Link>
            </span>
          );
        } else {
          description.summary = (
            <span>
              {t`deleted an alert about - `}
              <span className="text-dark">{item.details.name}</span>
            </span>
          );
        }
        break;
      case "card-create":
      case "card-update":
        if (item.table) {
          description.summary = (
            <span>
              {t`saved a question about `}
              <Link
                to={Urls.tableRowsQuery(item.database_id, item.table_id)}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Database -> " + item.topic
                }
                className="link text-dark"
              >
                {item.table.display_name}
              </Link>
            </span>
          );
        } else {
          description.summary = t`saved a question`;
        }
        break;
      case "card-delete":
        description.summary = t`deleted a question`;
        break;
      case "dashboard-create":
        description.summary = t`created a dashboard`;
        break;
      case "dashboard-delete":
        description.summary = t`deleted a dashboard`;
        break;
      case "dashboard-add-cards":
        if (item.model_exists) {
          description.summary = (
            <span>
              {t`added a question to the dashboard - `}
              <Link
                to={Urls.dashboard(item.model_id)}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Dashboard -> " + item.topic
                }
                className="link text-dark"
              >
                {item.details.name}
              </Link>
            </span>
          );
        } else {
          description.summary = (
            <span>
              {t`added a question to the dashboard - `}
              <span className="text-dark">{item.details.name}</span>
            </span>
          );
        }
        break;
      case "dashboard-remove-cards":
        if (item.model_exists) {
          description.summary = (
            <span>
              {t`removed a question from the dashboard - `}
              <Link
                to={Urls.dashboard(item.model_id)}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Dashboard -> " + item.topic
                }
                className="link text-dark"
              >
                {item.details.name}
              </Link>
            </span>
          );
        } else {
          description.summary = (
            <span>
              {t`removed a question from the dashboard - `}
              <span className="text-dark">{item.details.name}</span>
            </span>
          );
        }
        break;
      case "database-sync":
        if (item.details.name) {
          description.summary = (
            <span>
              {t`received the latest data from`}{" "}
              <span className="text-dark">{item.details.name}</span>
            </span>
          );
        } else {
          description.summary = (
            <span>
              {t`received the latest data from`}{" "}
              <span className="text-dark">
                {/* NOTE: this is a relic from the very early days of the activity feed when we accidentally didn't
                  * capture the name/description/engine of a Database properly in the details and so it was
                  * possible for a database to be deleted and we'd lose any way of knowing what it's name was :(
                  */}
                {(item.database && item.database.name) || t`Unknown`}
              </span>
            </span>
          );
        }
        break;
      case "install":
        description.userName = t`Hello World!`;
        description.summary = t`Metabase is up and running.`;
        break;
      case "metric-create":
        if (item.model_exists) {
          description.summary = (
            <span>
              {t`added the metric `}
              <Link
                to={Urls.tableRowsQuery(
                  item.database_id,
                  item.table_id,
                  item.model_id,
                )}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Metric -> " + item.topic
                }
                className="link text-dark"
              >
                {item.details.name}
              </Link>
              {t` to the `}
              <Link
                to={Urls.tableRowsQuery(item.database_id, item.table_id)}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Table -> " + item.topic
                }
                className="link text-dark"
              >
                {item.table.display_name}
              </Link>
              {t` table`}
            </span>
          );
        } else {
          description.summary = (
            <span>
              {t`added the metric `}{" "}
              <span className="text-dark">{item.details.name}</span>
            </span>
          );
        }
        break;
      case "metric-update":
        if (item.model_exists) {
          description.summary = (
            <span>
              {t`made changes to the metric `}
              <Link
                to={Urls.tableRowsQuery(
                  item.database_id,
                  item.table_id,
                  item.model_id,
                )}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Metric -> " + item.topic
                }
                className="link text-dark"
              >
                {item.details.name}
              </Link>
              {t` in the `}
              <Link
                to={Urls.tableRowsQuery(item.database_id, item.table_id)}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Table -> " + item.topic
                }
                className="link text-dark"
              >
                {item.table.display_name}
              </Link>
              {t` table`}
            </span>
          );
        } else {
          description.summary = (
            <span>
              {t`made changes to the metric `}{" "}
              <span className="text-dark">{item.details.name}</span>
            </span>
          );
        }
        break;
      case "metric-delete":
        description.summary = t`removed the metric ` + item.details.name;
        break;
      case "pulse-create":
        description.summary = t`created a pulse`;
        break;
      case "pulse-delete":
        description.summary = t`deleted a pulse`;
        break;
      case "segment-create":
        if (item.model_exists) {
          description.summary = (
            <span>
              {t`added the filter`}{" "}
              <Link
                to={Urls.tableRowsQuery(
                  item.database_id,
                  item.table_id,
                  null,
                  item.model_id,
                )}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Segment -> " + item.topic
                }
                className="link text-dark"
              >
                {item.details.name}
              </Link>
              {t` to the `}
              <Link
                to={Urls.tableRowsQuery(item.database_id, item.table_id)}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Table -> " + item.topic
                }
                className="link text-dark"
              >
                {item.table.display_name}
              </Link>
              {t` table`}
            </span>
          );
        } else {
          description.summary = (
            <span>
              {t`added the filter`}{" "}
              <span className="text-dark">{item.details.name}</span>
            </span>
          );
        }
        break;
      case "segment-update":
        if (item.model_exists) {
          description.summary = (
            <span>
              {t`made changes to the filter`}{" "}
              <Link
                to={Urls.tableRowsQuery(
                  item.database_id,
                  item.table_id,
                  null,
                  item.model_id,
                )}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Segment -> " + item.topic
                }
                className="link text-dark"
              >
                {item.details.name}
              </Link>
              {t` in the `}
              <Link
                to={Urls.tableRowsQuery(item.database_id, item.table_id)}
                data-metabase-event={
                  "Activity Feed;Header Clicked;Table -> " + item.topic
                }
                className="link text-dark"
              >
                {item.table.display_name}
              </Link>
              {t` table`}
            </span>
          );
        } else {
          description.summary = (
            <span>
              {t`made changes to the filter`}{" "}
              <span className="text-dark">{item.details.name}</span>
            </span>
          );
        }
        break;
      case "segment-delete":
        description.summary = t`removed the filter ${item.details.name}`;
        break;
      case "user-joined":
        description.summary = t`joined!`;
        break;
    }

    return description;
  }

  activityStory(item) {
    // this is a base to start with
    const description = {
      topic: item.topic,
      body: null,
      bodyLink: null,
    };

    switch (item.topic) {
      case "card-create":
      case "card-update":
        description.body = item.details.name;
        description.bodyLink = item.model_exists
          ? Urls.modelToUrl(item.model, item.model_id)
          : null;
        break;
      case "card-delete":
        description.body = item.details.name;
        break;
      case "dashboard-create":
        description.body = item.details.name;
        description.bodyLink = item.model_exists
          ? Urls.modelToUrl(item.model, item.model_id)
          : null;
        break;
      case "dashboard-delete":
        description.body = item.details.name;
        break;
      case "dashboard-add-cards":
      case "dashboard-remove-cards":
        description.body = item.details.dashcards[0].name;
        if (item.details.dashcards[0].exists) {
          description.bodyLink = Urls.question(
            item.details.dashcards[0].card_id,
          );
        }
        break;
      case "metric-create":
        description.body = item.details.description;
        break;
      case "metric-update":
        description.body = item.details.revision_message;
        break;
      case "metric-delete":
        description.body = item.details.revision_message;
        break;
      case "pulse-create":
        description.body = item.details.name;
        description.bodyLink = item.model_exists
          ? Urls.modelToUrl(item.model, item.model_id)
          : null;
        break;
      case "pulse-delete":
        description.body = item.details.name;
        break;
      case "segment-create":
        description.body = item.details.description;
        break;
      case "segment-update":
        description.body = item.details.revision_message;
        break;
      case "segment-delete":
        description.body = item.details.revision_message;
        break;
    }

    return description;
  }

  initialsCssClasses(user) {
    let { userColors } = this.state;

    if (user) {
      const userColorIndex = userColors[user.id];
      const colorCssClass = this.colorClasses[userColorIndex];

      return colorCssClass;
    }
  }

  render() {
    let { activity, user } = this.props;
    let { error } = this.state;

    return (
      <LoadingAndErrorWrapper loading={!activity} error={error}>
        {() => (
          <div className="full flex flex-column">
            <div className="">
              {activity.length === 0 ? (
                <div className="flex flex-column layout-centered mt4">
                  <span className="QuestionCircle">!</span>
                  <div className="text-normal mt3 mb1">
                    {t`Hmmm, looks like nothing has happened yet.`}
                  </div>
                  <div className="text-normal text-light">
                    {t`Save a question and get this baby going!`}
                  </div>
                </div>
              ) : (
                <ul className="pb4 relative">
                  {activity.map(item => (
                    <li key={item.id} className="mt3">
                      <ActivityItem
                        item={item}
                        description={this.activityHeader(item, user)}
                        userColors={this.initialsCssClasses(item.user)}
                      />
                      <ActivityStory story={this.activityStory(item)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
