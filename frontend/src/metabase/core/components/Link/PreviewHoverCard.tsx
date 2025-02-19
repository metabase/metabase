import type { LinkProps } from "react-router";

import PinnedQuestionCard from "metabase/collections/components/PinnedQuestionCard";
import { Flex, HoverCard } from "metabase/ui";
import type { CollectionItem, RecentItem } from "metabase-types/api";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useUnmount } from "react-use";

export type PreviewHoverCardProps = {
  preview: CollectionItem | RecentItem;
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

  return (
    <HoverCard
      openDelay={200}
      shadow="xs"
      offset={{ mainAxis: -10, crossAxis: 36 }}
      position="top-start"
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
        <QuestionPreview item={preview} onClose={onClose} />
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
