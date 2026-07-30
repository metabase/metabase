import { jt, t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Text } from "metabase/ui";

import { ChecklistItem } from "../ChecklistItem";
import { VideoTutorial } from "../VideoTutorial";
import type { OnboardingItemProps } from "../types";

export const AlertItem = ({ itemRef }: OnboardingItemProps) => {
  const applicationName = useSelector(getApplicationName);

  return (
    <ChecklistItem
      value="alert"
      icon="alert"
      label={t`Get notified when data changes`}
      itemRef={itemRef}
    >
      <VideoTutorial
        id="MPw5__mVg58"
        si="jaUgne1VDg6VXprJ"
        title="How to create an alert?"
      />
      <Text>
        {jt`Schedule ${(
          <b key="alerts">{t`Alerts`}</b>
        )} via email, Slack, or to a webhook when results meet a certain condition. You can also schedule ${(
          <b key="subscriptions">{t`Dashboard subscriptions`}</b>
        )} to send results to people, including to people that don't have accounts in your ${applicationName}.`}
      </Text>
    </ChecklistItem>
  );
};
