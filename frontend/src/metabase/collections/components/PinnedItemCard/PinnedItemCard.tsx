import React, { useState, useCallback } from "react";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import { Item, Collection } from "metabase/collections/utils";

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

type Props = {
  className?: string;
  item: Item;
  collection: Collection;
  onCopy: (items: Item[]) => void;
  onMove: (items: Item[]) => void;
};

const TOOLTIP_MAX_WIDTH = 450;

function getDefaultDescription(model: string) {
  return {
    card: t`A question`,
    dashboard: t`A dashboard`,
    dataset: t`A model`,
  }[model];
}

function PinnedItemCard({
  className,
  item,
  collection,
  onCopy,
  onMove,
}: Props) {
  const [showTitleTooltip, setShowTitleTooltip] = useState(false);
  const [showDescriptionTooltip, setShowDescriptionTooltip] = useState(false);
  const icon = item.getIcon().name;
  const { description, name, model } = item;

  const defaultedDescription = description || getDefaultDescription(model);

  const maybeEnableTooltip = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    setterFn: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    const target = event.target as HTMLDivElement;
    const isTargetElWiderThanCard = target?.scrollWidth > target?.clientWidth;
    if (isTargetElWiderThanCard) {
      setterFn(true);
    }
  };

  const handlePin = useCallback(() => {
    item.setPinned(false);
  }, [item]);

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
    <ItemLink className={className} to={item.getUrl()}>
      <ItemCard flat>
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
          <Tooltip
            tooltip={name}
            placement="bottom"
            maxWidth={TOOLTIP_MAX_WIDTH}
            isEnabled={showTitleTooltip}
          >
            <Title
              onMouseEnter={e => maybeEnableTooltip(e, setShowTitleTooltip)}
            >
              {name}
            </Title>
          </Tooltip>
          <Tooltip
            tooltip={description}
            placement="bottom"
            maxWidth={TOOLTIP_MAX_WIDTH}
            isEnabled={showDescriptionTooltip}
          >
            {defaultedDescription && (
              <Description
                onMouseEnter={e =>
                  maybeEnableTooltip(e, setShowDescriptionTooltip)
                }
              >
                {defaultedDescription}
              </Description>
            )}
          </Tooltip>
        </Body>
      </ItemCard>
    </ItemLink>
  );
}

export default PinnedItemCard;
