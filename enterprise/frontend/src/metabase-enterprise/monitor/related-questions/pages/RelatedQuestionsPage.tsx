import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { useSelector } from "metabase/redux";
import { Button, Center, Flex, Loader, Stack, Text } from "metabase/ui";
import {
  useGetRelatedQuestionsQuery,
  useGetRelatedQuestionsStatusQuery,
  useLazyGetRelatedQuestionsQuery,
  useTriggerRelatedQuestionsBackfillMutation,
} from "metabase-enterprise/api";
import type {
  RelatedQuestion,
  RelatedQuestionsResponse,
  RelatedQuestionsRow,
} from "metabase-types/api";

import { RelatedQuestionsTable } from "./RelatedQuestionsTable";

const PAGE_SIZE = 50;

type MergedRow = {
  question: RelatedQuestion;
  related: Map<number, RelatedQuestion>;
};

function mergePages(pages: Record<number, RelatedQuestionsResponse>) {
  const rows = new Map<number, MergedRow>();

  Object.values(pages)
    .sort((a, b) => a.offset - b.offset)
    .flatMap((page) => page.data)
    .forEach((row: RelatedQuestionsRow) => {
      const current = rows.get(row.question.id) ?? {
        question: row.question,
        related: new Map(),
      };
      row.related_questions.forEach((relatedQuestion) =>
        current.related.set(relatedQuestion.id, relatedQuestion),
      );
      rows.set(row.question.id, current);
    });

  return [...rows.values()]
    .sort((a, b) => a.question.id - b.question.id)
    .map(({ question, related }) => ({
      question,
      related_questions: [...related.values()].sort((a, b) => a.id - b.id),
    }));
}

export function RelatedQuestionsPage() {
  const isAdmin = useSelector(getUserIsAdmin);
  const [offset, setOffset] = useState(0);
  const [snapshotRevision, setSnapshotRevision] = useState<string | null>(null);
  const [pages, setPages] = useState<Record<number, RelatedQuestionsResponse>>(
    {},
  );
  const {
    currentData: pageData,
    error: pageError,
    isFetching: isFetchingPage,
    isLoading: isLoadingPage,
    refetch: refetchPage,
  } = useGetRelatedQuestionsQuery({ limit: PAGE_SIZE, offset });
  const [loadPage] = useLazyGetRelatedQuestionsQuery();
  const {
    data: status,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = useGetRelatedQuestionsStatusQuery();
  const [triggerBackfill, { isLoading: isTriggering }] =
    useTriggerRelatedQuestionsBackfillMutation();

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
        <MonitorHeaderTitle>{t`Related questions`}</MonitorHeaderTitle>
        {isAdmin && (
          <Button
            variant="default"
            loading={isTriggering}
            onClick={handleRecheck}
          >
            {t`Recheck related questions`}
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
        <Text c="text-secondary">{t`The related questions check is queued.`}</Text>
      )}
      {status?.state === "failed" && (
        <Text c="error">{t`The related questions check could not be completed.`}</Text>
      )}

      {pageError ? (
        <Center flex={1}>
          <Stack align="center">
            <Text>{t`Unable to load related questions.`}</Text>
            <Button variant="default" onClick={handleRetry}>
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
            {t`Semantic search is unavailable. Configure semantic search to check for related questions.`}
          </Text>
        </Center>
      ) : !hasRows ? (
        <Center flex={1}>
          <Text c="text-secondary">{t`No related questions found.`}</Text>
        </Center>
      ) : (
        <>
          <RelatedQuestionsTable rows={mergedRows} />
          <Flex align="center" justify="space-between">
            <Text c="text-secondary" size="sm">
              {t`Loaded ${loadedPairs} of ${totalPairs} related question pairs`}
            </Text>
            {canLoadMore && (
              <Button
                variant="default"
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
