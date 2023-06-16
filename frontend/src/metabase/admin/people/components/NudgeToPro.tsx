import { t } from "ttag";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { useSelector } from "metabase/lib/redux";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";
import { NudgeCard, Description, Subtitle, ProLink } from "./NudgeToPro.styled";

export const NudgeToPro = () => {
  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, { utm_media: "admin_people" }),
  );
  return (
    <NudgeCard>
      <Icon name="group" size={40} color={color("brand")} />
      <Description>{t`Tired of manually manging people and groups?`}</Description>
      <Subtitle>{t`Get single-sign on (SSO) via SAML, JWT, or LDAP with Metabase Pro`}</Subtitle>
      <ProLink href={upgradeUrl}>{t`Learn more`}</ProLink>
    </NudgeCard>
  );
};
