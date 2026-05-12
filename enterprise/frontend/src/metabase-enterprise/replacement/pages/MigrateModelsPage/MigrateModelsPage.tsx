import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { ListErrorState } from "metabase/common/components/ListErrorState";
import { Card, Flex, Stack } from "metabase/ui";
import type { CardId } from "metabase-types/api";

import S from "./MigrateModelsPage.module.css";
import { ModelSidebar } from "./ModelSidebar";
import { ModelTable } from "./ModelTable";
import { PageHeader } from "./PageHeader";

export function MigrateModelsPage() {
  const { data, isLoading, error } = useSearchQuery({
    models: ["dataset"],
  });
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedCardId, setSelectedCardId] = useState<CardId>();
  const searchResults = data?.data ?? [];
  const selectedSearchResult = searchResults.find(
    (result) => result.id === selectedCardId,
  );

  useLayoutEffect(() => {
    if (selectedCardId != null && selectedSearchResult == null) {
      setSelectedCardId(undefined);
    }
  }, [selectedCardId, selectedSearchResult]);

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <PageHeader />
        <Card flex="0 1 auto" mih={0} p={0} withBorder>
          {!isLoading && error != null ? (
            <ListErrorState error={error} />
          ) : !isLoading && searchResults.length === 0 ? (
            <ListEmptyState label={t`No models yet`} />
          ) : (
            <ModelTable
              searchResults={searchResults}
              isLoading={isLoading}
              onSelect={(result) => setSelectedCardId(Number(result.id))}
            />
          )}
        </Card>
      </Stack>
      {selectedCardId != null && (
        <ModelSidebar
          cardId={selectedCardId}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedCardId(undefined)}
        />
      )}
    </Flex>
  );
}
