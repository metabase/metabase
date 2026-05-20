import { Link } from "react-router";
import { jt, t } from "ttag";

import {
  useGetChannelInfoQuery,
  useListSecurityAdvisoriesQuery,
} from "metabase/api";
import { Banner } from "metabase/common/components/Banner";
import { useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import { Anchor, Text } from "metabase/ui";

import { isAffected } from "../../utils";

export function SecurityCenterBanner() {
  const tokenFeatures = useSetting("token-features");
  const plan = getPlan(tokenFeatures);
  const { data: channelInfo, isLoading: isChannelInfoLoading } =
    useGetChannelInfoQuery();
  const { data: advisoriesResponse, isLoading: isAdvisoriesLoading } =
    useListSecurityAdvisoriesQuery();

  if (plan !== "pro-self-hosted") {
    return null;
  }

  if (isChannelInfoLoading || isAdvisoriesLoading) {
    return null;
  }

  const hasEmail = !!channelInfo?.channels?.email?.configured;
  const hasSlack = !!channelInfo?.channels?.slack?.configured;

  if (hasEmail || hasSlack) {
    return null;
  }

  const advisories = advisoriesResponse?.advisories ?? [];
  const hasActiveAdvisory = advisories.some(isAffected);

  if (!hasActiveAdvisory) {
    return null;
  }

  const securityCenterLink = (
    <Anchor
      key="link"
      component={Link}
      fw="bold"
      to="/admin/security-center?open=notifications"
      c="inherit"
      td="underline"
    >
      {t`Security center`}
    </Anchor>
  );

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- only visible to admins on self-hosted instances
  const body = jt`Please configure notification channels in the ${securityCenterLink} so that you get notified about security vulnerabilities in your Metabase instance`;

  return (
    <Banner
      contentGroupProps={{ wrap: "nowrap" }}
      icon="warning_round_filled"
      bg="error"
      body={<Text lh="inherit">{body}</Text>}
      py="md"
    />
  );
}
