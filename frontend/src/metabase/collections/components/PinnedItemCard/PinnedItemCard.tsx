import React, { useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { getSetting } from "metabase/selectors/settings";
import Tooltip from "metabase/core/components/Tooltip";
import ActionMenu from "metabase/collections/components/ActionMenu";
import ModelDetailLink from "metabase/models/components/ModelDetailLink";
import ModelXrayLink from "metabase/models/components/ModelXrayLink";
import { isItemModel } from "metabase/collections/utils";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import { State } from "metabase-types/store";
import {
  Body,
  Description,
  Header,
  ActionsContainer,
  ItemCard,
  ItemIcon,
  ItemLink,
  Title,
} from "./PinnedItemCard.styled";

interface OwnProps {
  bookmarks?: Bookmark[];
  createBookmark: (id: string, collection: string) => void;
  deleteBookmark: (id: string, collection: string) => void;
  className?: string;
  item: CollectionItem;
  collection: Collection;
  onCopy: (items: CollectionItem[]) => void;
  onMove: (items: CollectionItem[]) => void;
}

interface StateProps {
  isXrayEnabled: boolean;
}

type PinnedItemCardProps = OwnProps & StateProps;

const TOOLTIP_MAX_WIDTH = 450;

function getDefaultDescription(model: string) {
  return {
    card: t`A question`,
    dashboard: t`A dashboard`,
    dataset: t`A model`,
  }[model];
}

function mapStateToProps(state: State): StateProps {
  return {
    isXrayEnabled: getSetting(state, "enable-xrays"),
  };
}

function PinnedItemCard({
  className,
  item,
  collection,
  bookmarks,
  isXrayEnabled,
  onCopy,
  onMove,
  createBookmark,
  deleteBookmark,
}: PinnedItemCardProps) {
  const [showTitleTooltip, setShowTitleTooltip] = useState(false);
  const [showDescriptionTooltip, setShowDescriptionTooltip] = useState(false);
  const icon = item.getIcon().name;
  const { description, name, model } = item;
  const defaultedDescription = description || getDefaultDescription(model);
  const isModel = isItemModel(item);

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

  return (
    <ItemLink className={className} to={item.getUrl()}>
      <ItemCard flat>
        <Body>
          <Header>
            <ItemIcon name={icon} />
            <ActionsContainer>
              {isModel && isXrayEnabled && <ModelXrayLink id={item.id} />}
              {isModel && <ModelDetailLink model={item} />}
              <ActionMenu
                bookmarks={bookmarks}
                createBookmark={createBookmark}
                deleteBookmark={deleteBookmark}
                item={item}
                collection={collection}
                onCopy={onCopy}
                onMove={onMove}
              />
            </ActionsContainer>
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

export default connect(mapStateToProps)(PinnedItemCard);
