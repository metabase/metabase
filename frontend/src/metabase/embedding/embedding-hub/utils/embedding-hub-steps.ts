import { t } from "ttag";

import type { EmbeddingHubStep } from "../types";

export const getEmbeddingHubSteps = (): EmbeddingHubStep[] => {
  const TEST_EMBED: EmbeddingHubStep = {
    id: "create-test-embed",
    title: t`Create embed`,
    icon: "test_tube",
    actions: [
      {
        title: t`Create an embed`,
        description: t`Create an embed by using Embedded Analytics JS.`,
        to: "/embed-js?auth_method=user_session",
        variant: "outline",
      },
    ],
    image: {
      src: "app/assets/img/embedding_hub_create_embed.png",
      srcSet: "app/assets/img/embedding_hub_create_embed@2x.png 2x",
      alt: t`Screenshot of creating an embed`,
    },
  };

  const ADD_DATA: EmbeddingHubStep = {
    id: "add-data",
    title: t`Add your data`,
    icon: "add_data",
    image: {
      src: "app/assets/img/onboarding_data_diagram.png",
      srcSet: "app/assets/img/onboarding_data_diagram@2x.png 2x",
      alt: t`Data sources and ETL diagram`,
    },
    actions: [
      {
        title: t`Add data`,
        description: t`Connect your own database or upload a CSV and start working with your real data.`,
        modal: { type: "add-data", initialTab: "db" },
        variant: "outline",
      },
    ],
  };

  const CREATE_DASHBOARD: EmbeddingHubStep = {
    id: "create-dashboard",
    title: t`Prepare data`,
    icon: "dashboard",
    video: {
      id: "FOAXF4p1AL0",
      trackingId: "COmu2w0SqGagUoVp",
      title: t`How to find and use X-rays?`,
    },
    actions: [
      {
        title: t`Generate a dashboard`,
        description: t`Automatically generate a dashboard from your data using x-rays.`,
        modal: { type: "xray-dashboard" },
        variant: "outline",
      },
      // {
      //   title: t`Build a dashboard`,
      //   description: t`Build your own dashboard from scratch.`,
      //   modal: { type: "new-dashboard" },
      //   variant: "subtle",
      //   optional: true,
      // },
      {
        title: t`Create models`,
        description: t`Set up data models for your embedded analytics.`,
        to: "/model/new",
        optional: true,
        stepId: "create-models",
      },
    ],
  };

  const SECURE_EMBEDS: EmbeddingHubStep = {
    id: "secure-embeds",
    title: t`Security and permissions`,
    icon: "lock",
    actions: [
      {
        title: t`Configure SSO`,
        description: t`Configure JWT or SAML authentication to ensure only authorized users can access your embeds.`,
        docsPath: "embedding/embedded-analytics-js#set-up-sso",
        variant: "outline",
        stepId: "secure-embeds",
      },
      {
        title: t`Configure data permissions`,
        docsPath:
          "permissions/embedding#one-database-for-all-customers-commingled-setups",
        description: t`Manage permissions to limit what data your users can access.`,
        variant: "outline",
        stepId: "configure-row-column-security",
        optional: true,
      },
    ],
    image: {
      src: "app/assets/img/embedding_hub_secure_embeds_diagram.png",
      srcSet: "app/assets/img/embedding_hub_secure_embeds_diagram@2x.png 2x",
      alt: t`Diagram of the SSO authentication workflow`,
    },
  };

  const EMBED_PRODUCTION: EmbeddingHubStep = {
    id: "embed-production",
    title: t`Deployment`,
    icon: "code_block",
    actions: [
      {
        title: t`Embed in production`,
        description: t`Deploy your embedded dashboard to a production environment and share with your users.`,
        to: "/embed-js?auth_method=sso",
        variant: "outline",
      },
    ],
    image: {
      src: "app/assets/img/embedding_hub_create_embed.png",
      srcSet: "app/assets/img/embedding_hub_create_embed@2x.png 2x",
      alt: t`Screenshot of creating an embed`,
    },
    infoAlert: {
      type: "locked",
      message: t`Configure SSO authentication to unlock this step.`,
    },
  };

  return [
    ADD_DATA,
    CREATE_DASHBOARD,
    TEST_EMBED,
    SECURE_EMBEDS,
    EMBED_PRODUCTION,
  ];
};
