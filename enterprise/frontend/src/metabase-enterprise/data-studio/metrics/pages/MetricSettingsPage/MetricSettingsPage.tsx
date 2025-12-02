import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SidesheetCard } from "metabase/common/components/Sidesheet/SidesheetCard";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_CACHING } from "metabase/plugins";
import { Box, Center, Flex } from "metabase/ui";
import { useLoadCardWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-card-with-metadata";
import Question from "metabase-lib/v1/Question";

import { MetricHeader } from "../../components/MetricHeader";

type MetricSettingsPageParams = {
  cardId: string;
};

type MetricSettingsPageProps = {
  params: MetricSettingsPageParams;
  children?: ReactNode;
};

export function MetricSettingsPage({ params }: MetricSettingsPageProps) {
  const [page, setPage] = useState<"default" | "caching">("default");
  const cardId = Urls.extractEntityId(params.cardId);
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);
  const question = useMemo(() => card && new Question(card), [card]);

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (!question) {
    return null;
  }

  return (
    <Flex direction="column" h="100%">
      <MetricHeader card={card} />
      <Box mx="md" mt="sm" maw={480}>
        <SidesheetCard title={t`Caching`}>
          <PLUGIN_CACHING.SidebarCacheSection
            model="question"
            item={question}
            setPage={setPage}
            key={page}
          />
        </SidesheetCard>
      </Box>
      {page === "caching" && (
        <PLUGIN_CACHING.SidebarCacheForm
          item={question}
          model="question"
          onBack={() => setPage("default")}
          onClose={() => setPage("default")}
          pt="md"
        />
      )}
    </Flex>
  );
}
