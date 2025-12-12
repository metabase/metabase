import { t } from "ttag";

import { UpsellCard } from "metabase/common/components/UpsellCard";
import { hasAnySsoFeature } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { Box, List } from "metabase/ui";

import { UPGRADE_URL } from "./constants";

export const UpsellSSO = ({ location }: { location: string }) => {
  const campaign = "sso";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });
  const tokenFeatures = useSelector((state) =>
    getSetting(state, "token-features"),
  );

  const hasSso = hasAnySsoFeature(tokenFeatures);
  const hasScim = tokenFeatures["scim"];

  if (hasSso || hasScim) {
    return null;
  }

  return (
    <UpsellCard
      title={t`Tired of manually managing people and groups?`}
      campaign={campaign}
      buttonText={t`Try Metabase Pro`}
      buttonLink={UPGRADE_URL}
      location={location}
      style={{ maxWidth: 242 }}
      onClick={triggerUpsellFlow}
    >
      <Box px=".5rem">
        {t`Metabase Pro and Enterprise plans include:`}
        <List size="sm">
          <List.Item>{t`SSO with SAML and JWT`}</List.Item>
          <List.Item>{t`Metabase group sync with SAML, JWT, and LDAP`}</List.Item>
          <List.Item>{t`User provisioning with SCIM`}</List.Item>
        </List>
      </Box>
    </UpsellCard>
  );
};
