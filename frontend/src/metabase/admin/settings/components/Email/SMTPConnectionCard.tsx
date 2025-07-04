import { useDisclosure } from "@mantine/hooks";

import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { PLUGIN_SMTP_OVERRIDE } from "metabase/plugins";

import { SelfHostedSMTPConnectionCard } from "./SelfHostedSMTPConnectionCard";
import { SelfHostedSMTPConnectionForm } from "./SelfHostedSMTPConnectionForm";
import { trackSMTPSetupClick } from "./analytics";

export const SMTPConnectionCard = () => {
  const hasCloudSMTPFeature = useHasTokenFeature("cloud-custom-smtp");
  const [showModal, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const isHosted = useSetting("is-hosted?");

  if (!isHosted) {
    return (
      <>
        <SelfHostedSMTPConnectionCard
          onOpenSMTPModal={() => {
            openModal();
            trackSMTPSetupClick({ eventDetail: "self-hosted" });
          }}
        />
        {showModal && <SelfHostedSMTPConnectionForm onClose={closeModal} />}
      </>
    );
  }
  if (isHosted && hasCloudSMTPFeature) {
    return (
      <>
        <PLUGIN_SMTP_OVERRIDE.CloudSMTPConnectionCard
          onOpenCloudSMTPModal={() => {
            openModal();
            trackSMTPSetupClick({ eventDetail: "cloud" });
          }}
        />
        {showModal && (
          <PLUGIN_SMTP_OVERRIDE.SMTPOverrideConnectionForm
            onClose={closeModal}
          />
        )}
      </>
    );
  }

  return null;
};
