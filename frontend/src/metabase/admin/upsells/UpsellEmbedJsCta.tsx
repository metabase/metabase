import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { isEEBuild } from "metabase/lib/utils";
import {
  PLUGIN_ADMIN_SETTINGS,
  type SdkIframeEmbedSetupModalProps,
} from "metabase/plugins";
import type {
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/lib/types";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { Box } from "metabase/ui";

import { UpsellCta } from "./components/UpsellCta";
import { trackUpsellClicked } from "./components/analytics";
import { useUpsellLink } from "./components/use-upsell-link";

export function useUpsellEmbedJsCta({
  resource,
  resourceType,
  closeModal,
}: {
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  closeModal: () => void;
}) {
  const dispatch = useDispatch();

  const campaign = "embedded-analytics-js";
  const location = "static-embed-popover";

  const isEmbedJsEnabled = useHasTokenFeature("embedding_simple");

  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  const trackUpsell = () => trackUpsellClicked({ location, campaign });

  const url = useUpsellLink({
    url: `https://www.metabase.com/product/embedded-analytics`,
    campaign,
    location,
  });

  if (isEmbedJsEnabled) {
    return {
      openEmbedFlow: () => {
        const modalProps: Pick<SdkIframeEmbedSetupModalProps, "initialState"> =
          {
            initialState: {
              resourceType,
              resourceId: resource.id,
            },
          };

        closeModal();

        dispatch(
          setOpenModalWithProps({
            id: "embed",
            props: modalProps,
          }),
        );
      },
    };
  }

  return {
    url,
    triggerUpsellFlow,
    trackUpsell,
  };
}

export function UpsellEmbedJsCta({
  resource,
  resourceType,
  closeModal,
}: {
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  closeModal: () => void;
}) {
  const { openEmbedFlow, url, triggerUpsellFlow, trackUpsell } =
    useUpsellEmbedJsCta({ resource, resourceType, closeModal });

  if (!isEEBuild()) {
    return null;
  }

  return (
    <Box>
      <UpsellCta
        onClick={() => {
          if (triggerUpsellFlow) {
            triggerUpsellFlow();
          } else if (openEmbedFlow) {
            openEmbedFlow();
          }
        }}
        internalLink={undefined}
        buttonText={t`Try for free`}
        url={url}
        onClickCapture={() => trackUpsell?.()}
        size="large"
      />
    </Box>
  );
}
