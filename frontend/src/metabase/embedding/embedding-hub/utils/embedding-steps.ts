import { t } from "ttag";

import type { EmbeddingStep } from "../types";

export const getEmbeddingSteps = (): EmbeddingStep[] => {
  const TEST_EMBED: EmbeddingStep = {
    id: "test-embed",
    title: t`Create a test embed`,
    icon: "check",
    description: t`Test out the capabilities of Embedded Analytics JS by embedding a sample dashboard.`,
    actions: [
      {
        label: t`Create an embed`,
        to: "/embed-js",
        variant: "outline",
        adminOnly: true,
      },
    ],
  };

  const ADD_DATA: EmbeddingStep = {
    id: "add-data",
    title: t`Add your data`,
    icon: "add_data",
    description: t`You can connect multiple databases, and query them directly with the query builder or the Native/SQL editor. \${applicationName} connects to more than 15 popular databases.`,
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
        adminOnly: true,
      },
      {
        label: t`Upload a CSV`,
        to: "/admin/databases",
        variant: "subtle",
        adminOnly: true,
      },
    ],
  };

  const CREATE_DASHBOARD: EmbeddingStep = {
    id: "create-dashboard",
    title: t`Create a dashboard`,
    icon: "dashboard",
    description: t`Automatically generate a dashboard from your data using x-rays or build one manually.`,
    actions: [
      {
        label: t`Create dashboard`,
        to: "/dashboard/new",
        variant: "outline",
        adminOnly: true,
      },
    ],
  };

  const CONFIGURE_SANDBOXING: EmbeddingStep = {
    id: "configure-sandboxing",
    title: t`Configure sandboxing`,
    icon: "key",
    description: t`Manage permissions to limit what data your users can access.`,
    actions: [
      {
        label: t`Configure permissions`,
        to: "/admin/permissions",
        variant: "outline",
        adminOnly: true,
      },
    ],
  };

  const SECURE_EMBEDS: EmbeddingStep = {
    id: "secure-embeds",
    title: t`Secure your embeds`,
    icon: "lock",
    description: t`Configure JWT or SAML authentication to ensure only authorized users can access your embeds.`,
    actions: [
      {
        label: t`Configure embedding`,
        to: "/admin/settings/embedding-in-other-applications",
        variant: "outline",
        adminOnly: true,
      },
      {
        label: t`Manage users`,
        to: "/admin/people",
        variant: "subtle",
        adminOnly: true,
      },
    ],
  };

  const EMBED_PRODUCTION: EmbeddingStep = {
    id: "embed-production",
    title: t`Embed in production`,
    icon: "bolt",
    description: t`Deploy your embedded dashboard to a production environment and share with your users.`,
    actions: [
      {
        label: t`View implementation guide`,
        href: "/docs/embedding/introduction", // This will be replaced by the selector in the component
        variant: "outline",
        showWhenMetabaseLinksEnabled: true,
      },
      {
        label: t`Review settings`,
        to: "/admin/settings/embedding-in-other-applications",
        variant: "subtle",
        adminOnly: true,
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
