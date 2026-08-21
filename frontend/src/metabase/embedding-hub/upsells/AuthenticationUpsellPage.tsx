import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";

import { BaseUpsellPage } from "./BaseUpsellPage";

export function AuthenticationUpsellPage({ source }: { source: string }) {
  const hasSsoJwt = useHasTokenFeature("sso_jwt");

  if (hasSsoJwt) {
    return null;
  }

  return (
    <BaseUpsellPage
      campaign="embedding-sso"
      location={source}
      title={t`Secure your embeds with single sign-on`}
      description={t`Connect Metabase to your identity provider using JSON Web Tokens (JWT) to authenticate people to ensure only authorized users can access your embeds.`}
      image="app/assets/img/upsell-embedding-sso.svg"
    />
  );
}
