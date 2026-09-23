import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { useSelector } from "metabase/redux";
import { Button, Center, Flex, Loader, Stack, Text } from "metabase/ui";
import {
  useGetSemanticDuplicatesQuery,
  useGetSemanticDuplicatesStatusQuery,
  useLazyGetSemanticDuplicatesQuery,
  useTriggerSemanticDuplicatesBackfillMutation,
} from "metabase-enterprise/api";
import type {
  SemanticDuplicateQuestion,
  SemanticDuplicateRow,
  SemanticDuplicatesResponse,
} from "metabase-types/api";

import { SemanticDuplicatesTable } from "./SemanticDuplicatesTable";

const PAGE_SIZE = 50;

type MergedRow = {
  question: SemanticDuplicateQuestion;
  duplicates: Map<number, SemanticDuplicateQuestion>;
};

function mergePages(pages: Record<number, SemanticDuplicatesResponse>) {
  const rows = new Map<number, MergedRow>();

  Object.values(pages)
    .sort((a, b) => a.offset - b.offset)
    .flatMap((page) => page.data)
    .forEach((row: SemanticDuplicateRow) => {
      const current = rows.get(row.question.id) ?? {
        question: row.question,
        duplicates: new Map(),
      };
      row.duplicates.forEach((duplicate) =>
        current.duplicates.set(duplicate.id, duplicate),
      );
      rows.set(row.question.id, current);
    });

  return [...rows.values()]
    .sort((a, b) => a.question.id - b.question.id)
    .map(({ question, duplicates }) => ({
      question,
      duplicates: [...duplicates.values()].sort((a, b) => a.id - b.id),
    }));
}

export function SemanticDuplicatesPage() {
  const isAdmin = useSelector(getUserIsAdmin);
  const [offset, setOffset] = useState(0);
  const [snapshotRevision, setSnapshotRevision] = useState<string | null>(null);
  const [pages, setPages] = useState<
    Record<number, SemanticDuplicatesResponse>
  >({});
  const {
    currentData: pageData,
    error: pageError,
    isFetching: isFetchingPage,
    isLoading: isLoadingPage,
    refetch: refetchPage,
  } = useGetSemanticDuplicatesQuery({ limit: PAGE_SIZE, offset });
  const [loadPage] = useLazyGetSemanticDuplicatesQuery();
  const {
    data: status,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = useGetSemanticDuplicatesStatusQuery();
  const [triggerBackfill, { isLoading: isTriggering }] =
    useTriggerSemanticDuplicatesBackfillMutation();

  useEffect(() => {
    if (status?.state !== "pending" && status?.state !== "running") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refetchStatus();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [refetchStatus, status?.state]);

  useEffect(() => {
    if (!pageData) {
      return;
    }
    const expectedRevision = status?.snapshot_revision ?? snapshotRevision;
    if (
      expectedRevision != null &&
      pageData.snapshot_revision !== expectedRevision
    ) {
      return;
    }
    setSnapshotRevision(pageData.snapshot_revision);
    setPages((current) => ({ ...current, [pageData.offset]: pageData }));
  }, [pageData, snapshotRevision, status?.snapshot_revision]);

  useEffect(() => {
    const statusRevision = status?.snapshot_revision;
    if (
      statusRevision != null &&
      statusRevision !== snapshotRevision &&
      pageData != null
    ) {
      setPages({});
      setOffset(0);
      setSnapshotRevision(statusRevision);
      void loadPage({ limit: PAGE_SIZE, offset: 0 }, false);
    }
  }, [loadPage, pageData, snapshotRevision, status?.snapshot_revision]);

  const mergedRows = useMemo(() => mergePages(pages), [pages]);
  const loadedPairs = Object.values(pages).reduce(
    (total, page) => total + page.pair_count,
    0,
  );
  const totalPairs = pageData?.total ?? Object.values(pages)[0]?.total ?? 0;
  const canLoadMore =
    pageData != null && offset + pageData.pair_count < pageData.total;

  const handleRetry = () => {
    refetchPage();
    refetchStatus();
  };

  const handleRecheck = async () => {
    await triggerBackfill().unwrap();
    await refetchStatus();
  };

  const hasRows = mergedRows.length > 0;
  const isLoading =
    isLoadingPage || isLoadingStatus || (isFetchingPage && !hasRows);

  return (
    <MonitorMain>
      <Flex align="center" justify="space-between" pr="4rem">
        <MonitorHeaderTitle>{t`Potential duplicates`}</MonitorHeaderTitle>
        {isAdmin && (
          <Button
            variant="outline"
            loading={isTriggering}
            onClick={handleRecheck}
          >
            {t`Recheck duplicates`}
          </Button>
        )}
      </Flex>

      {status?.state === "running" && (
        <Text c="text-secondary">
          {t`Analyzing questions ${status.processed_questions} of ${status.total_questions}…`}
          {hasRows && ` ${t`The previous snapshot remains visible.`}`}
        </Text>
      )}
      {status?.state === "pending" && (
        <Text c="text-secondary">{t`The duplicate check is queued.`}</Text>
      )}
      {status?.state === "failed" && (
        <Text c="error">{t`The duplicate check could not be completed.`}</Text>
      )}

      {pageError ? (
        <Center flex={1}>
          <Stack align="center">
            <Text>{t`Unable to load potential duplicates.`}</Text>
            <Button variant="outline" onClick={handleRetry}>
              {t`Retry`}
            </Button>
          </Stack>
        </Center>
      ) : isLoading && !hasRows ? (
        <Center flex={1}>
          <Loader />
        </Center>
      ) : !status?.available && !hasRows ? (
        <Center flex={1}>
          <Text c="text-secondary">
            {t`Semantic search is unavailable. Configure semantic search to check for potential duplicates.`}
          </Text>
        </Center>
      ) : !hasRows ? (
        <Center flex={1}>
          <Text c="text-secondary">{t`No potential duplicates found.`}</Text>
        </Center>
      ) : (
        <>
          <SemanticDuplicatesTable rows={mergedRows} />
          <Flex align="center" justify="space-between">
            <Text c="text-secondary" size="sm">
              {t`Loaded ${loadedPairs} of ${totalPairs} duplicate pairs`}
            </Text>
            {canLoadMore && (
              <Button
                variant="outline"
                loading={isFetchingPage}
                disabled={isFetchingPage}
                onClick={() => setOffset(offset + (pageData?.pair_count ?? 0))}
              >
                {t`Load more`}
              </Button>
            )}
          </Flex>
        </>
      )}
    </MonitorMain>
  );
}
