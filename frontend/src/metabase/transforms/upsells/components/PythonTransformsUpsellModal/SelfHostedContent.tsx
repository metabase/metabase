import { t } from "ttag";

import { useUpgradeAction } from "metabase/admin/upsells/components/UpgradeModal";
import { UpsellCta } from "metabase/admin/upsells/components/UpsellCta";
import { trackUpsellClicked } from "metabase/admin/upsells/components/analytics";
import { useUpsellLink } from "metabase/admin/upsells/components/use-upsell-link";
import { DATA_STUDIO_UPGRADE_URL } from "metabase/admin/upsells/constants";
import { getPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { Flex } from "metabase/ui";

import { CAMPAIGN, LOCATION, UPGRADE_URL } from "./constants";

type SelfHostedContentProps = {
  handleModalClose: VoidFunction;
};

export const SelfHostedContent = (props: SelfHostedContentProps) => {
  const { handleModalClose } = props;
  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );

  const upsellUrl = useUpsellLink({
    url: UPGRADE_URL,
    campaign: CAMPAIGN,
    location: LOCATION,
  });
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign: CAMPAIGN,
    location: LOCATION,
  });

  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: DATA_STUDIO_UPGRADE_URL,
    campaign: CAMPAIGN,
    location: LOCATION,
  });

  const handleClickStarter = () => {
    triggerUpsellFlow?.();
    handleModalClose();
  };

  return (
    <Flex justify="flex-end">
      {plan === "oss" ? (
        <UpsellCta
          onClick={upgradeOnClick}
          url={upgradeUrl}
          internalLink={undefined}
          buttonText={t`Get Python transforms`}
          onClickCapture={() =>
            trackUpsellClicked({ location: LOCATION, campaign: CAMPAIGN })
          }
          size="large"
        />
      ) : (
        <UpsellCta
          onClick={handleClickStarter}
          url={upsellUrl}
          internalLink={undefined}
          buttonText={t`Get Python transforms`}
          onClickCapture={() =>
            trackUpsellClicked({ location: LOCATION, campaign: CAMPAIGN })
          }
          size="large"
        />
      )}
    </Flex>
  );
};
