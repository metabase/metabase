import { t } from "ttag";

import { hasAnySsoFeature } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Box, List } from "metabase/ui";

import { UpsellCard } from "./components";

export const UpsellSSO = ({ source }: { source: string }) => {
  const tokenFeatures = useSelector(state =>
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
      campaign="sso"
      buttonText={t`Learn more`}
      buttonLink="https://www.metabase.com/cloud"
      source={source}
      style={{ maxWidth: 242 }}
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
