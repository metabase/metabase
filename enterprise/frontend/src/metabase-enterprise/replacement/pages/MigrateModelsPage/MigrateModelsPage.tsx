import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useLayoutEffect, useState } from "react";

import { useListCardsQuery } from "metabase/api";
import { Flex, Stack } from "metabase/ui";
import type { CardId } from "metabase-types/api";

import S from "./MigrateModelsPage.module.css";
import { ModelSidebar } from "./ModelSidebar";
import { ModelTable } from "./ModelTable";
import { PageHeader } from "./PageHeader";

export function MigrateModelsPage() {
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedCardId, setSelectedCardId] = useState<CardId>();

  const { data: cards = [], isLoading } = useListCardsQuery({
    f: "persisted",
  });

  const selectedCard =
    selectedCardId != null
      ? cards.find((card) => card.id === selectedCardId)
      : undefined;

  useLayoutEffect(() => {
    if (selectedCardId != null && selectedCard == null) {
      setSelectedCardId(undefined);
    }
  }, [selectedCardId, selectedCard]);

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <PageHeader />
        <ModelTable
          cards={cards}
          isLoading={isLoading}
          onSelect={(card) => setSelectedCardId(card.id)}
        />
      </Stack>
      {selectedCard != null && (
        <ModelSidebar
          card={selectedCard}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedCardId(undefined)}
        />
      )}
    </Flex>
  );
}
