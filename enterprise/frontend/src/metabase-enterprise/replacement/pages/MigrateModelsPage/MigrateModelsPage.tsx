import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";

import { useSearchQuery } from "metabase/api";
import { Flex, Stack } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import S from "./MigrateModelsPage.module.css";
import { ModelSidebar } from "./ModelSidebar";
import { ModelTable } from "./ModelTable";
import { PageHeader } from "./PageHeader";

export function MigrateModelsPage() {
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedResult, setSelectedResult] = useState<SearchResult>();

  const { data, isLoading } = useSearchQuery({
    models: ["dataset"],
  });

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
          results={data?.data ?? []}
          isLoading={isLoading}
          onSelect={setSelectedResult}
        />
      </Stack>
      {selectedResult != null && (
        <ModelSidebar
          result={selectedResult}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedResult(undefined)}
        />
      )}
    </Flex>
  );
}
