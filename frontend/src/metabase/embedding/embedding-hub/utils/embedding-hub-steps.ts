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
    image: {
      src: "app/assets/img/embedding_hub_create_test_embed.png",
      srcSet: "app/assets/img/embedding_hub_create_test_embed@2x.png 2x",
      alt: t`Screenshot of creating a test embed`,
    },
  };

  const ADD_DATA: EmbeddingHubStep = {
    id: "add-data",
    title: t`Add your data`,
    icon: "add_data",
    // eslint-disable-next-line no-literal-metabase-strings -- only shown to admins.
    description: t`You can connect databases or upload CSVs, and query them directly with the query builder or the Native/SQL editor. Metabase connects to more than 15 popular databases.`,
    image: {
      src: "app/assets/img/onboarding_data_diagram.png",
      srcSet: "app/assets/img/onboarding_data_diagram@2x.png 2x",
      alt: t`Data sources and ETL diagram`,
    },
    actions: [
      {
        label: t`Add data`,
        to: "/admin/databases/create",
        variant: "outline",
      },
    ],
  };

  const CREATE_DASHBOARD: EmbeddingHubStep = {
    id: "create-dashboard",
    title: t`Create a dashboard`,
    icon: "dashboard",
    // eslint-disable-next-line no-literal-metabase-strings -- only shown to admins.
    description: t`Metabase X-rays let you select a table to automatically generate a dashboard populated with charts. Alternatively, you can create a dashboard manually.`,
    video: {
      id: "FOAXF4p1AL0",
      trackingId: "COmu2w0SqGagUoVp",
      title: t`How to find and use X-rays?`,
    },
    actions: [
      {
        label: t`Generate automatic dashboard`,
        // TODO(EMB-741): use a wizard
        to: "/auto/dashboard/table/1",
        variant: "outline",
      },
    ],
  };

  const CONFIGURE_ROW_COLUMN_SECURITY: EmbeddingHubStep = {
    id: "configure-row-column-security",
    title: t`Configure row and column security`,
    icon: "permissions_limited",
    description: t`Manage permissions to limit what data your users can access.`,
    actions: [
      {
        label: t`Read the docs`,
        docsPath: "permissions/row-and-column-security",
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
        label: t`Learn more`,
        docsPath: "people-and-groups/authenticating-with-jwt",
        variant: "outline",
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
        label: t`Create an embed`,
        to: "/embed-js",
        variant: "outline",
      },
    ],
  };

  return [
    TEST_EMBED,
    ADD_DATA,
    CREATE_DASHBOARD,
    CONFIGURE_ROW_COLUMN_SECURITY,
    SECURE_EMBEDS,
    EMBED_PRODUCTION,
  ];
};
