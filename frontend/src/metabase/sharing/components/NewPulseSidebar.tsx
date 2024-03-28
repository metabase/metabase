import cx from "classnames";
import { t, jt } from "ttag";

import Text from "metabase/components/type/Text";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { ChannelCard } from "metabase/sharing/components/NewPulseSidebar.styled";
import { Icon } from "metabase/ui";

interface NewPulseSidebarProps {
  emailConfigured: boolean;
  slackConfigured: boolean;
  onNewEmailPulse: () => void;
  onNewSlackPulse: () => void;
  onCancel: () => void;
}

export function NewPulseSidebar({
  onCancel,
  emailConfigured,
  slackConfigured,
  onNewEmailPulse,
  onNewSlackPulse,
}: NewPulseSidebarProps) {
  const applicationName = useSelector(getApplicationName);
  return (
    <Sidebar onCancel={onCancel}>
      <div className="mt2 pt2 px4">
        <h4>{t`Create a dashboard subscription`}</h4>
      </div>
      <div className="my1 mx4">
        <ChannelCard
          flat
          className={cx("mt1 mb3", {
            [cx(CS.hoverParent, CS.hoverInherit)]: emailConfigured,
          })}
          isConfigured={emailConfigured}
          onClick={onNewEmailPulse}
        >
          <div className="px3 pt3 pb2">
            <div className={cx(CS.flex, CS.alignCenter)}>
              <Icon
                name="mail"
                className={cx(
                  [CS.mr1],
                  {
                    [cx(CS.textBrand, CS.hoverChild, CS.hoverInherit)]:
                      emailConfigured,
                  },
                  { [CS.textLight]: !emailConfigured },
                )}
              />
              <h3
                className={cx({ [CS.textLight]: !emailConfigured })}
              >{t`Email it`}</h3>
            </div>
            <Text
              className={cx(CS.textMedium, {
                [cx(CS.hoverChild, CS.hoverInherit)]: emailConfigured,
              })}
            >
              {!emailConfigured &&
                jt`You'll need to ${(
                  <Link
                    key="link"
                    to="/admin/settings/email"
                    className={CS.link}
                  >
                    {t`set up email`}
                  </Link>
                )} first.`}
              {emailConfigured &&
                t`You can send this dashboard regularly to users or email addresses.`}
            </Text>
          </div>
        </ChannelCard>
        <ChannelCard
          flat
          className={cx({
            [cx(CS.hoverParent, CS.hoverInherit)]: slackConfigured,
          })}
          isConfigured={slackConfigured}
          onClick={onNewSlackPulse}
        >
          <div className="px3 pt3 pb2">
            <div className={cx(CS.flex, CS.alignCenter, CS.mb1)}>
              <Icon
                name={slackConfigured ? "slack_colorized" : "slack"}
                size={16}
                className={cx(CS.mr1, {
                  [CS.textLight]: !slackConfigured,
                  [cx(CS.hoverChild, CS.hoverInherit)]: slackConfigured,
                })}
              />
              <h3
                className={cx({ [CS.textLight]: !slackConfigured })}
              >{t`Send it to Slack`}</h3>
            </div>
            <Text
              className={cx(CS.textMedium, {
                [cx(CS.hoverChild, CS.hoverInherit)]: slackConfigured,
              })}
            >
              {!slackConfigured &&
                jt`First, you'll have to ${(
                  <Link
                    key="link"
                    to="/admin/settings/slack"
                    className={CS.link}
                  >
                    {t`configure Slack`}
                  </Link>
                )}.`}
              {slackConfigured &&
                t`Pick a channel and a schedule, and ${applicationName} will do the rest.`}
            </Text>
          </div>
        </ChannelCard>
      </div>
    </Sidebar>
  );
}
