import { jt, t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { Alert, Anchor, Icon } from "metabase/ui";

import { SETUP_SSO_CAMPAIGN, UTM_LOCATION } from "../../analytics";

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: SETUP_SSO_CAMPAIGN,
  utm_content: UTM_LOCATION,
};

type SetupSsoAlertProps = {
  variant?: "local-testing" | "data-app";
};

export const SetupSsoAlert = ({
  variant = "local-testing",
}: SetupSsoAlertProps) => {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Only for admins
  const { url: setupSsoUrl } = useDocsUrl("embedding/authentication", {
    utm: utmTags,
  });

  const setupSsoLink = (
    <Anchor
      key="configure-sso"
      href={setupSsoUrl}
      target="_blank"
      fz="inherit"
      lh="inherit"
    >
      {t`JWT SSO or SAML`}
    </Anchor>
  );

  // data apps does not support local testing with browser sessions
  const warningMessage =
    variant === "data-app"
      ? jt`Configure ${setupSsoLink} to embed a data app.`
      : jt`This embed will only work for local testing. To get production ready code, configure ${setupSsoLink}.`;

  return (
    <Alert
      size="compact"
      icon={<Icon name="warning_triangle_filled" />}
      color="warning"
    >
      {warningMessage}
    </Alert>
  );
};
