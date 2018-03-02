/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { Link } from "react-router";
import { jt, t } from "c-3po";

import cx from "classnames";

import * as Urls from "metabase/lib/urls";
import PulseListChannel from "./PulseListChannel.jsx";

export default class PulseListItem extends Component {
  static propTypes = {
    pulse: PropTypes.object.isRequired,
    formInput: PropTypes.object.isRequired,
    user: PropTypes.object.isRequired,
    scrollTo: PropTypes.bool.isRequired,
    savePulse: PropTypes.func.isRequired,
  };

  componentDidMount() {
    if (this.props.scrollTo) {
      const element = ReactDOM.findDOMNode(this.refs.pulseListItem);
      element.scrollIntoView(true);
    }
  }

  render() {
    let { pulse, formInput, user } = this.props;

    const creator = (
      <span className="text-bold">
        {pulse.creator && pulse.creator.common_name}
      </span>
    );
    return (
      <div
        ref="pulseListItem"
        className={cx("PulseListItem bordered rounded mb2 pt3", {
          "PulseListItem--focused": this.props.scrollTo,
        })}
      >
        <div className="px4 mb2">
          <div className="flex align-center mb1">
            <h2 className="break-word" style={{ maxWidth: "80%" }}>
              {pulse.name}
            </h2>
            {!pulse.read_only && (
              <div className="ml-auto">
                <Link
                  to={"/pulse/" + pulse.id}
                  className="PulseEditButton PulseButton Button no-decoration text-bold"
                >
                  {t`Edit`}
                </Link>
              </div>
            )}
          </div>
          <span>{jt`Pulse by ${creator}`}</span>
        </div>
        <ol className="mb2 px4 flex flex-wrap">
          {pulse.cards.map((card, index) => (
            <li key={index} className="mr1 mb1">
              <Link to={Urls.question(card.id)} className="Button">
                {card.name}
              </Link>
            </li>
          ))}
        </ol>
        <ul className="border-top px4 bg-grey-0">
          {pulse.channels.filter(channel => channel.enabled).map(channel => (
            <li key={channel.id} className="border-row-divider">
              <PulseListChannel
                pulse={pulse}
                channel={channel}
                channelSpec={
                  formInput.channels && formInput.channels[channel.channel_type]
                }
                user={user}
                savePulse={this.props.savePulse}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }
}
