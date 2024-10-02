import { UpsellUsageAnalytics } from "metabase/admin/upsells/UpsellUsageAnalytics";
import { Flex } from "metabase/ui";

export const InsightsUpsellTab = ({
  model,
}: {
  model: "question" | "dashboard";
}) => {
  return (
    <Flex justify="center">
      <UpsellUsageAnalytics
        source={`${model}-insights-upsell-tab`}
        maxWidth={480}
      />
    </Flex>
  );
};
