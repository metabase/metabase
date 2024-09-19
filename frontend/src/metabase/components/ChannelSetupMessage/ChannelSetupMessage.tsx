import cx from "classnames";
import { Component } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import Settings from "metabase/lib/settings";
import type { User } from "metabase-types/api";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class ChannelSetupMessage extends Component<{
  user: User;
  channels: string[];
}> {
  static defaultProps = {
    channels: ["email", "Slack"],
  };

  render() {
    const { user, channels } = this.props;
    let content;
    if (user.is_superuser) {
      content = (
        <div>
          {channels.map(c => (
            <Link
              to={"/admin/settings/" + c.toLowerCase()}
              key={c.toLowerCase()}
              className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary, CS.mr1)}
              target={(window as any).OSX ? undefined : "_blank"}
            >
              {t`Configure`} {c}
            </Link>
          ))}
        </div>
      );
    } else {
      const adminEmail = Settings.get("admin-email");
      content = (
        <div className={CS.mb1}>
          <h4 className={CS.textMedium}>{t`Your admin's email address`}:</h4>
          <a className={cx(CS.h2, CS.link)} href={"mailto:" + adminEmail}>
            {adminEmail}
          </a>
        </div>
      );
    }
    return content;
  }
}
