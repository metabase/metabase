import { t } from "ttag";

import { UpsellCta } from "metabase/admin/upsells/components/UpsellCta";
import { trackUpsellClicked } from "metabase/admin/upsells/components/analytics";
import { useUpsellLink } from "metabase/admin/upsells/components/use-upsell-link";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { Flex } from "metabase/ui";

import { CAMPAIGN, LOCATION, UPGRADE_URL } from "./constants";

type SelfHostedContentProps = {
  handleModalClose: VoidFunction;
};

export const SelfHostedContent = (props: SelfHostedContentProps) => {
  const { handleModalClose } = props;
  const upsellUrl = useUpsellLink({
    url: UPGRADE_URL,
    campaign: CAMPAIGN,
    location: LOCATION,
  });
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign: CAMPAIGN,
    location: LOCATION,
  });

  const handleSelfHostedClick = () => {
    trackUpsellClicked({ location: LOCATION, campaign: CAMPAIGN });
    triggerUpsellFlow?.();
    handleModalClose();
  };

  return (
    <Flex justify="flex-end">
      <UpsellCta
        onClick={handleSelfHostedClick}
        url={upsellUrl}
        internalLink={undefined}
        buttonText={t`Get Python transforms`}
        onClickCapture={() =>
          trackUpsellClicked({ location: LOCATION, campaign: CAMPAIGN })
        }
        size="large"
      />
    </Flex>
  );
};
