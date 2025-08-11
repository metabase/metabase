import { PLUGIN_SMTP_OVERRIDE } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  CloudSMTPConnectionCard,
  SMTPOverrideConnectionForm,
} from "./components";

if (hasPremiumFeature("cloud_custom_smtp")) {
  PLUGIN_SMTP_OVERRIDE.CloudSMTPConnectionCard = CloudSMTPConnectionCard;
  PLUGIN_SMTP_OVERRIDE.SMTPOverrideConnectionForm = SMTPOverrideConnectionForm;
}
