/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import { Link } from "react-router";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import Settings from "metabase/lib/settings";

const CHANNEL_MAP = {
  email: {
    name: "email",
    link: "/admin/settings/email",
  },
  Slack: {
    name: "Slack",
    link: "/admin/settings/notifications/slack",
  },
  webhook: {
    name: "Webhook",
    link: "/admin/settings/notifications",
  },
};

type ChannelSetupMessageProps = {
  isAdminUser: boolean;
  channels: ("email" | "Slack" | "webhook")[];
};

export const ChannelSetupMessage = ({
  isAdminUser,
  channels = ["email", "Slack", "webhook"],
}: ChannelSetupMessageProps) => {
  const adminEmail = Settings.get("admin-email");

  if (isAdminUser) {
    return (
      <div>
        {channels.map(c => {
          const config = CHANNEL_MAP[c];

          return config ? (
            <Link
              to={CHANNEL_MAP[c].link}
              key={c.toLowerCase()}
              className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary, CS.mr1)}
              target="_blank"
            >
              {t`Configure`} {c}
            </Link>
          ) : null;
        })}
      </div>
    );
  }

  return (
    <div className={CS.mb1}>
      <h4 className={CS.textMedium}>{t`Your admin's email address`}:</h4>
      <a className={cx(CS.h2, CS.link)} href={"mailto:" + adminEmail}>
        {adminEmail}
      </a>
    </div>
  );
};
