import React, { useState, useCallback } from "react";

import Tooltip from "metabase/components/Tooltip";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

import {
  ItemLink,
  ItemCard,
  Header,
  Body,
  ItemIcon,
  Title,
  Description,
  HoverMenu,
} from "./PinnedItemCard.styled";

type Item = {
  name: string;
  description: string | null;
  collection_position?: number | null;
  id: number;
  getIcon: () => { name: string };
  getUrl: () => string;
  setArchived: (isArchived: boolean) => void;
  copy?: boolean;
  setCollection?: boolean;
};

type Collection = {
  can_write: boolean;
};

type Props = {
  className?: string;
  item: Item;
  collection: Collection;
  onToggleSelected: (item: Item) => void;
  onCopy: (items: Item[]) => void;
  onMove: (items: Item[]) => void;
};

function PinnedItemCard({
  className,
  item,
  collection,
  onToggleSelected,
  onCopy,
  onMove,
}: Props) {
  const [showDescriptionTooltip, setShowDescriptionTooltip] = useState(false);
  const icon = item.getIcon().name;
  const { description, name } = item;

  const maybeEnableDescriptionTooltip = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    const target = event.target as HTMLDivElement;
    // check if the description is wider than the card
    if (target && target.scrollWidth > target.clientWidth) {
      setShowDescriptionTooltip(true);
    }
  };

  const handlePin = useCallback(() => {
    onToggleSelected(item);
  }, [item, onToggleSelected]);

  const handleCopy = useCallback(() => {
    onCopy([item]);
  }, [item, onCopy]);

  const handleMove = useCallback(() => {
    onMove([item]);
  }, [item, onMove]);

  const handleArchive = useCallback(() => {
    item.setArchived(true);
  }, [item]);

  return (
    <ItemLink to={item.getUrl()}>
      <ItemCard className={className}>
        <Body>
          <Header>
            <ItemIcon name={icon} />
            <div
              onClick={e => {
                e.stopPropagation();
                e.preventDefault();
              }}
            >
              <HoverMenu
                item={item}
                onPin={collection.can_write ? handlePin : null}
                onMove={
                  collection.can_write && item.setCollection ? handleMove : null
                }
                onCopy={item.copy ? handleCopy : null}
                onArchive={
                  collection.can_write && item.setArchived
                    ? handleArchive
                    : null
                }
                analyticsContext={ANALYTICS_CONTEXT}
                className={undefined}
              />
            </div>
          </Header>
          <Title>{name}</Title>
          <Tooltip
            tooltip={description}
            placement="bottom"
            maxWidth={450}
            isEnabled={showDescriptionTooltip}
          >
            {description && (
              <Description onMouseEnter={maybeEnableDescriptionTooltip}>
                {description}
              </Description>
            )}
          </Tooltip>
        </Body>
      </ItemCard>
    </ItemLink>
  );
}

export default PinnedItemCard;
