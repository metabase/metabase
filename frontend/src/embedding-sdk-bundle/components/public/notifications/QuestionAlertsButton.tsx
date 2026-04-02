import { PLUGIN_NOTIFICATIONS_SDK } from "embedding-sdk-bundle/components/public/notifications";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";

export function QuestionAlertsButton() {
  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);

  if (isGuestEmbed) {
    return null;
  }

  return <PLUGIN_NOTIFICATIONS_SDK.QuestionAlertsButton />;
}
