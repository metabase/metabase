import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import * as Urls from "metabase/lib/urls";
import { Center, Stack } from "metabase/ui";

import { MetricHomeAbout } from "./MetricHomeAbout";
import { MetricHomeHeader } from "./MetricHomeHeader";
import { MetricHomeOverview } from "./MetricHomeOverview";

type MetricHomePageParams = {
  slug: string;
};

type MetricHomePageProps = {
  params: MetricHomePageParams;
  routes: Array<{ path?: string }>;
};

export function MetricHomePage({ params, routes }: MetricHomePageProps) {
  const cardId = Urls.extractEntityId(params.slug);
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const isOverviewTab = routes.some((route) => route.path === "overview");

  return (
    <Stack
      bg="background-secondary"
      h="100%"
      pb="2rem"
      px="3.5rem"
      gap="xl"
      style={{ overflow: "auto" }}
    >
      <MetricHomeHeader card={card} />
      {isOverviewTab ? (
        <MetricHomeOverview card={card} />
      ) : (
        <MetricHomeAbout card={card} />
      )}
    </Stack>
  );
}
