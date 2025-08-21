import { t } from "ttag";

import type { EmbeddingHubStep } from "../types";

export const getEmbeddingHubSteps = (): EmbeddingHubStep[] => {
  const TEST_EMBED: EmbeddingHubStep = {
    id: "create-test-embed",
    title: t`Create a test embed`,
    icon: "check",
    description: t`Test out the capabilities of Embedded Analytics JS by embedding a sample dashboard.`,
    actions: [
      {
        label: t`Create an embed`,
        to: "/embed-js",
        variant: "outline",
      },
    ],
  };

  const ADD_DATA: EmbeddingHubStep = {
    id: "add-data",
    title: t`Add your data`,
    icon: "add_data",
    // eslint-disable-next-line no-literal-metabase-strings -- only shown to admins.
    description: t`You can connect multiple databases, and query them directly with the query builder or the Native/SQL editor. Metabase connects to more than 15 popular databases.`,
    image: {
      src: "app/assets/img/onboarding_data_diagram.png",
      srcSet: "app/assets/img/onboarding_data_diagram@2x.png 2x",
      alt: t`Data sources and ETL diagram`,
    },
    actions: [
      {
        label: t`Add Database`,
        to: "/admin/databases/create",
        variant: "outline",
      },
    ],
  };

  const CREATE_DASHBOARD: EmbeddingHubStep = {
    id: "create-dashboard",
    title: t`Create a dashboard`,
    icon: "dashboard",
    description: t`Automatically generate a dashboard from your data using x-rays or build one manually.`,
    actions: [
      {
        label: t`Create dashboard`,
        to: "/admin/databases",
        variant: "outline",
      },
    ],
  };

  const CONFIGURE_SANDBOXING: EmbeddingHubStep = {
    id: "configure-sandboxing",
    title: t`Configure sandboxing`,
    icon: "permissions_limited",
    description: t`Manage permissions to limit what data your users can access.`,
    actions: [
      {
        label: t`Configure permissions`,
        // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
        href: "https://www.metabase.com/docs/latest/permissions/sandboxing",
        variant: "outline",
      },
    ],
  };

  const SECURE_EMBEDS: EmbeddingHubStep = {
    id: "secure-embeds",
    title: t`Secure your embeds`,
    icon: "lock",
    description: t`Configure JWT or SAML authentication to ensure only authorized users can access your embeds.`,
    actions: [
      {
        label: t`Configure embedding`,
        // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
        href: "https://www.metabase.com/docs/latest/people-and-groups/authenticating-with-jwt",
        variant: "outline",
      },
      {
        label: t`Manage users`,
        to: "/admin/people",
        variant: "subtle",
      },
    ],
  };

  const EMBED_PRODUCTION: EmbeddingHubStep = {
    id: "embed-production",
    title: t`Embed in production`,
    icon: "bolt",
    description: t`Deploy your embedded dashboard to a production environment and share with your users.`,
    actions: [
      {
        label: t`View implementation guide`,
        to: "/embed-js",
        variant: "outline",
      },
      {
        label: t`Review settings`,
        to: "/admin/settings/embedding-in-other-applications",
        variant: "subtle",
      },
    ],
  };

  return [
    TEST_EMBED,
    ADD_DATA,
    CREATE_DASHBOARD,
    CONFIGURE_SANDBOXING,
    SECURE_EMBEDS,
    EMBED_PRODUCTION,
  ];
};
