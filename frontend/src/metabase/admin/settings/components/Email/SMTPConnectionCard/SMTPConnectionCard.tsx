import { PLUGIN_SMTP_OVERRIDE } from "metabase/plugins";
import { useSetting } from "metabase/settings";

import { SelfHostedSMTPConnectionCard } from "../SelfHostedSMTPConnectionCard";

export const SMTPConnectionCard = () => {
  const isHosted = useSetting("is-hosted?");
  return isHosted ? (
    <PLUGIN_SMTP_OVERRIDE.CloudSMTPConnectionCard />
  ) : (
    <SelfHostedSMTPConnectionCard />
  );
};
