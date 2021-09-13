/* eslint "react/prop-types": "error" */

import React from "react";
import PropTypes from "prop-types";
import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import Text from "metabase/components/type/Text";
import Link from "metabase/components/Link";
import Sidebar from "metabase/dashboard/components/Sidebar";
import cx from "classnames";
import { t, jt } from "ttag";

function NewPulseSidebar({
  onCancel,
  emailConfigured,
  slackConfigured,
  onNewEmailPulse,
  onNewSlackPulse,
}) {
  return (
    <Sidebar onCancel={onCancel}>
      <div className="mt2 pt2 px4">
        <h4>{t`Create a dashboard subscription`}</h4>
      </div>
      <div className="my1 mx4">
        <Card
          flat
          className={cx("mt1 mb3", {
            "cursor-pointer text-white-hover bg-brand-hover hover-parent hover--inherit": emailConfigured,
          })}
          onClick={onNewEmailPulse}
        >
          <div className="px3 pt3 pb2">
            <div className="flex align-center">
              <Icon
                name="mail"
                className={cx(
                  "mr1",
                  {
                    "text-brand hover-child hover--inherit": emailConfigured,
                  },
                  { "text-light": !emailConfigured },
                )}
              />
              <h3
                className={cx({ "text-light": !emailConfigured })}
              >{t`Email it`}</h3>
            </div>
            <Text
              lineHeight={1.5}
              className={cx("text-medium", {
                "hover-child hover--inherit": emailConfigured,
              })}
            >
              {!emailConfigured &&
                jt`You'll need to ${(
                  <Link key="link" to="/admin/settings/email" className="link">
                    set up email
                  </Link>
                )} first.`}
              {emailConfigured &&
                t`You can send this dashboard regularly to users or email addresses.`}
            </Text>
          </div>
        </Card>
        <Card
          flat
          className={cx({
            "cursor-pointer text-white-hover bg-brand-hover hover-parent hover--inherit": slackConfigured,
          })}
          onClick={onNewSlackPulse}
        >
          <div className="px3 pt3 pb2">
            <div className="flex align-center mb1">
              <Icon
                name={slackConfigured ? "slack_colorized" : "slack"}
                size={24}
                className={cx("mr1", {
                  "text-light": !slackConfigured,
                  "hover-child hover--inherit": slackConfigured,
                })}
              />
              <h3
                className={cx({ "text-light": !slackConfigured })}
              >{t`Send it to Slack`}</h3>
            </div>
            <Text
              lineHeight={1.5}
              className={cx("text-medium", {
                "hover-child hover--inherit": slackConfigured,
              })}
            >
              {!slackConfigured &&
                jt`First, you'll have to ${(
                  <Link key="link" to="/admin/settings/slack" className="link">
                    configure Slack
                  </Link>
                )}.`}
              {slackConfigured &&
                t`Pick a channel and a schedule, and Metabase will do the rest.`}
            </Text>
          </div>
        </Card>
      </div>
    </Sidebar>
  );
}

NewPulseSidebar.propTypes = {
  onCancel: PropTypes.func.isRequired,
  emailConfigured: PropTypes.bool.isRequired,
  slackConfigured: PropTypes.bool.isRequired,
  onNewEmailPulse: PropTypes.func.isRequired,
  onNewSlackPulse: PropTypes.func.isRequired,
};

export default NewPulseSidebar;
