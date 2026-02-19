import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import {
  PLUGIN_TENANTS,
  type SdkIframeEmbedSetupModalInitialState,
} from "metabase/plugins";
import { setOpenModalWithProps } from "metabase/redux/ui";

import type { EmbeddingHubAction, EmbeddingHubStep } from "../types";

export const useGetEmbeddingHubSteps = (): EmbeddingHubStep[] => {
  const dispatch = useDispatch();

  const openEmbedModal = useCallback(
    (props: { initialState: SdkIframeEmbedSetupModalInitialState }) => {
      dispatch(
        setOpenModalWithProps({
          id: "embed",
          props,
        }),
      );
    },
    [dispatch],
  );

  return useMemo(() => {
    const isTenantsFeatureAvailable = PLUGIN_TENANTS.isEnabled;

    const TEST_EMBED: EmbeddingHubStep = {
      id: "create-test-embed",
      title: t`Create embed`,
      actions: [
        {
          title: t`Get embed snippet`,
          description: t`Embed a dashboard, question, the query builder or the collection browser. Configure the experience and customize the appearance.`,
          onClick: () => {
            openEmbedModal({
              initialState: {
                isGuest: true,
                useExistingUserSession: true,
              },
            });
          },
          variant: "outline",
        },
      ],
    };

    const ADD_DATA: EmbeddingHubStep = {
      id: "add-data",
      title: t`Add your data`,
      actions: [
        {
          title: t`Connect a database`,
          description: t`Connect your own database or upload a CSV and start working with your real data.`,
          modal: { type: "add-data", initialTab: "db" },
          variant: "outline",
        },
      ],
    };

    const CREATE_DASHBOARD: EmbeddingHubStep = {
      id: "create-dashboard",
      title: t`Prepare data`,
      actions: [
        {
          title: t`Create a dashboard`,
          description: t`Automatically generate a dashboard from your data using x-rays.`,
          modal: { type: "xray-dashboard" },
          variant: "outline",
        },
        {
          title: t`Create models`,
          description: t`Set up data models for your embedded analytics.`,
          to: "/model/new",
          optional: true,
          stepId: "create-models",
        },
      ],
    };

    const DATA_PERMISSION_CARD: EmbeddingHubAction = {
      title: t`Configure data permissions`,
      docsPath: "permissions/embedding",
      anchor: "one-database-for-all-customers-commingled-setups",
      description: t`Manage permissions to limit what data your users can access.`,
      variant: "outline",
      stepId: "configure-row-column-security",
      optional: true,
    };

    const SETUP_TENANTS: EmbeddingHubStep = {
      id: "setup-tenants",
      title: t`Pick a strategy for users and permissions`,
      actions: [
        {
          title: t`Pick a user strategy`,
          description: t`Decide between a multi-tenant or single-tenant user strategy.`,
          variant: "outline",
          modal: { type: "user-strategy" },
        },
        DATA_PERMISSION_CARD,
      ],
    };

    const SECURE_EMBEDS: EmbeddingHubStep = {
      id: "secure-embeds",
      title: t`Set up authentication`,
      actions: [
        {
          title: t`Configure SSO`,
          description: t`Configure JWT or SAML authentication to ensure only authorized users can access your embeds.`,
          docsPath: "embedding/embedded-analytics-js",
          anchor: "set-up-sso",
          variant: "outline",
          stepId: "secure-embeds",
        },

        // If tenants are not available, show data permission card on the authentication step.
        // Otherwise, it is already shown on the tenants setup step.
        ...(isTenantsFeatureAvailable ? [] : [DATA_PERMISSION_CARD]),
      ],
    };

    const EMBED_PRODUCTION: EmbeddingHubStep = {
      id: "embed-production",
      title: t`Deployment`,
      actions: [
        {
          title: t`Embed in production with SSO`,
          description: t`Deploy your embedded dashboard to a production environment and share with your users.`,
          onClick: () => {
            openEmbedModal({
              initialState: {
                isGuest: false,
                useExistingUserSession: false,
              },
            });
          },
          variant: "outline",
        },
      ],
    };

    return [
      ADD_DATA,
      CREATE_DASHBOARD,
      TEST_EMBED,
      ...(isTenantsFeatureAvailable ? [SETUP_TENANTS] : []),
      SECURE_EMBEDS,
      EMBED_PRODUCTION,
    ];
  }, [openEmbedModal]);
};
