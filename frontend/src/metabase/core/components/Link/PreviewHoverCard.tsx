import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useUnmount } from "react-use";
import { P, match } from "ts-pattern";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useGetCardQuery, useGetDashboardQuery } from "metabase/api";
import PinnedQuestionCard from "metabase/collections/components/PinnedQuestionCard";
import { Flex, HoverCard } from "metabase/ui";
import type { CollectionItem, RecentItem } from "metabase-types/api";

export type PreviewHoverCardProps = {
  /** The item that is previewed in the hovercard's dropdown */
  preview: CollectionItem | RecentItem;
  /** The target of the hovercard */
  children: ReactNode;
};

/** NOTE: This only previews questions at the moment */
export const PreviewHoverCard = ({
  preview,
  children,
}: PreviewHoverCardProps) => {
  const [shouldHideDropdown, setShouldHideDropdown] = useState(false);
  const timeoutRef = useRef<number>();
  const onClose = useCallback(() => {
    setShouldHideDropdown(true);

    // HACK:Re-enable dropdown after waiting
    clearTimeout(timeoutRef.current);
    setTimeout(() => {
      setShouldHideDropdown(false);
    }, 500);
  }, [setShouldHideDropdown]);

  useUnmount(() => {
    clearTimeout(timeoutRef.current);
  });

  const previewProps = {
    item: preview,
    onClose,
  };

  return (
    <HoverCard
      openDelay={200}
      shadow="xs"
      offset={
        // northeast of the target
        { mainAxis: -10, crossAxis: 36 }
      }
      position="top-start"
      transitionProps={{
        transition: "pop-bottom-left",
      }}
    >
      <HoverCard.Target>
        {/* <Flex> or <div> is required because a HoverCard target must be able to accept a ref */}
        <Flex style={{ flexGrow: 1 }}>{children}</Flex>
      </HoverCard.Target>
      <HoverCard.Dropdown
        display={shouldHideDropdown ? "none" : undefined}
        p={0}
        bd="1px solid rgba(0,0,0,.1)"
        mih="10rem"
        miw="30rem"
      >
        {match(preview.model)
          .with(P.union("dataset", "table", "card", "metric"), () => (
            <QuestionPreview {...previewProps} />
          ))
          .with("dashboard", () => <DashboardPreview {...previewProps} />)
          .with(P.union("collection", "snippet", "indexed-entity"), () => null)
          .exhaustive()}
      </HoverCard.Dropdown>
    </HoverCard>
  );
};

const QuestionPreview = ({
  item,
  onClose,
}: {
  item: CollectionItem | RecentItem;
  onClose: () => void;
}) => {
  const itemAsCollectionItem = {
    ...item,
    getUrl: () => {},
  } as CollectionItem; // TODO: Avoid this type coercion
  return (
    <PinnedQuestionCard
      item={itemAsCollectionItem}
      withActionMenu={false}
      withBorder={false}
      withCloseButton
      onClose={onClose}
    />
  );
};

const DashboardPreview = ({
  item,
  onClose,
}: {
  item: CollectionItem | RecentItem;
  onClose: () => void;
}) => {
  const { data: dashboard } = useGetDashboardQuery({ id: item.id });

  // Sort dashcards by row and col
  const dashcardsSorted = useMemo(() => {
    return dashboard?.dashcards.toSorted((a, b) => {
      if (a.row < b.row) {
        return -1;
      }
      if (a.row > b.row) {
        return 1;
      }
      if (a.col < b.col) {
        return -1;
      }
      if (a.col > b.col) {
        return 1;
      }
      return 0;
    });
  }, [dashboard]);

  const firstQuestion = dashcardsSorted?.[0];

  // const { data: firstQuestion } = useGetCardQuery(
  //   dashboard?.dashcards.length
  //     ? { id: dashboard.dashcards[0].card_id }
  //     : skipToken,
  // );

  if (!firstQuestion) {
    return null;
  }

  return (
    <ErrorBoundary>
      <DashcardPreview id={firstQuestion.card_id} onClose={onClose} />
    </ErrorBoundary>
  );
};

export const DashcardPreview = ({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) => {
  const { data: card } = useGetCardQuery({ id });

  if (!card) {
    return null;
  }
  return (
    <PinnedQuestionCard
      item={card as unknown as CollectionItem} // TODO: Don't coerce type
      withActionMenu={false}
      withBorder={false}
      withCloseButton
      onClose={onClose}
    />
  );
};
