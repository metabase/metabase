import { useCallback } from "react";

import { AuthButton } from "metabase/auth/components/AuthButton";
import type { AuthProvider } from "metabase/plugins/types";
import type { OidcAuthProvider } from "metabase-types/api";

interface OidcButtonProps {
  provider: OidcAuthProvider;
  isCard?: boolean;
  redirectUrl?: string;
}

export const OidcButton = ({
  provider,
  isCard,
  redirectUrl,
}: OidcButtonProps): JSX.Element => {
  const handleLogin = useCallback(() => {
    const ssoUrl = provider["sso-url"];
    const url = redirectUrl
      ? `${ssoUrl}?redirect=${encodeURIComponent(redirectUrl)}`
      : ssoUrl;
    window.location.href = url;
  }, [provider, redirectUrl]);

  return (
    <AuthButton isCard={isCard} onClick={handleLogin}>
      {provider["display-name"]}
    </AuthButton>
  );
};

/**
 * Create an AuthProvider entry for an OIDC provider.
 * This keeps JSX inside the .tsx file so it can be called from .ts modules.
 */
export function createOidcAuthProvider(
  oidcProvider: OidcAuthProvider,
): AuthProvider {
  return {
    name: `oidc-${oidcProvider.slug}`,
    Button: ({ isCard, redirectUrl }) => (
      <OidcButton
        provider={oidcProvider}
        isCard={isCard}
        redirectUrl={redirectUrl}
      />
    ),
  };
}
