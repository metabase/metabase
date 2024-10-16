import { UpsellUsageAnalytics } from "metabase/admin/upsells/UpsellUsageAnalytics";
import { Flex } from "metabase/ui";
import type { CardType } from "metabase-types/api";

export const InsightsUpsellTab = ({
  model,
}: {
  /** 'Model' in the sense of 'type of thing', not in the sense of 'dataset' */
  model: "dashboard" | CardType;
}) => {
  return (
    <Flex justify="center">
      <UpsellUsageAnalytics source={`${model}-sidesheet`} maxWidth={480} />
    </Flex>
  );
};
