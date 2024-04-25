import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { Icon } from "metabase/ui";

import { NudgeCard, Description, Subtitle, ProLink } from "./NudgeToPro.styled";

export const NudgeToPro = () => {
  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, { utm_media: "people" }),
  );
  return (
    <NudgeCard>
      <Icon name="group" size={40} color={color("brand")} />
      <Description>{t`Tired of manually managing people and groups?`}</Description>
      <Subtitle>{t`Get single-sign on (SSO) via SAML, JWT, or LDAP with Metabase Pro`}</Subtitle>
      <ProLink href={upgradeUrl}>{t`Learn more`}</ProLink>
    </NudgeCard>
  );
};
