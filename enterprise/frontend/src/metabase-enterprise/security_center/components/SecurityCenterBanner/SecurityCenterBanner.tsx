import { jt, t } from "ttag";

import { Banner } from "metabase/common/components/Banner";
import { Link } from "metabase/common/components/Link";
import { useLocation } from "metabase/router";
import { Anchor, Text } from "metabase/ui";

import { useListSecurityAdvisoriesQuery } from "../../api";
import { isAcknowledged, isAffected } from "../../utils";

export function SecurityCenterBanner() {
  const location = useLocation();
  const { data: advisoriesResponse, isLoading: isAdvisoriesLoading } =
    useListSecurityAdvisoriesQuery();

  if (isAdvisoriesLoading) {
    return null;
  }

  if (location.pathname.startsWith("/admin/security-center")) {
    return null;
  }

  const advisories = advisoriesResponse?.advisories ?? [];
  const hasActiveAdvisory = advisories.some(
    (advisory) => isAffected(advisory) && !isAcknowledged(advisory),
  );

  if (!hasActiveAdvisory) {
    return null;
  }

  const securityCenterLink = (
    <Anchor
      key="link"
      component={Link}
      fw="bold"
      to="/admin/security-center"
      c="inherit"
      td="underline"
    >
      {t`Security Center`}
    </Anchor>
  );

  const body = jt`A security update is available. See ${securityCenterLink} for more details.`;

  return (
    <Banner
      contentGroupProps={{ wrap: "nowrap" }}
      icon="warning_round_filled"
      bg="background_surface-warning"
      body={<Text lh="inherit">{body}</Text>}
      py="lg"
    />
  );
}
