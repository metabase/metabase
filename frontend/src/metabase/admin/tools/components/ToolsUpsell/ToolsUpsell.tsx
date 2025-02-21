import { UpsellPerformanceTools } from "metabase/admin/upsells";
import { Center } from "metabase/ui";

export const ToolsUpsell = () => {
  return (
    <Center inline w="100%">
      <UpsellPerformanceTools source="settings-tools" />
    </Center>
  );
};
