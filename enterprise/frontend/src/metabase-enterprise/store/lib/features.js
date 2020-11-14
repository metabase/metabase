import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";

const FEATURES = {
  sandboxes: {
    name: t`Data sandboxes`,
    description: t`Make sure you're showing the right people the right data with automatic and secure filters based on user attributes.`,
    icon: "lock",
    docs: [
      {
        link: MetabaseSettings.docsUrl("enterprise-guide/data-sandboxes"),
      },
    ],
  },
  whitelabel: {
    name: t`White labeling`,
    description: t`Match Metabase to your brand with custom colors, your own logo and more.`,
    icon: "star",
    docs: [
      {
        link: MetabaseSettings.docsUrl("enterprise-guide/whitelabeling"),
      },
    ],
  },
  "audit-app": {
    name: t`Auditing`,
    description: t`Keep an eye on performance and behavior with robust auditing tools.`,
    icon: "clipboard",
    info: [{ link: "https://metabase.com/enterprise/" }],
  },
  sso: {
    name: t`Single sign-on`,
    description: t`Provide easy login that works with your exisiting authentication infrastructure.`,
    icon: "group",
    docs: [
      {
        title: "SAML",
        link: MetabaseSettings.docsUrl(
          "enterprise-guide/authenticating-with-saml",
        ),
      },
      {
        title: "JWT",
        link: MetabaseSettings.docsUrl(
          "enterprise-guide/authenticating-with-jwt",
        ),
      },
    ],
  },
};

export default FEATURES;
