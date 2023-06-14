import { useState } from "react";
import * as React from "react";
import { t } from "ttag";

import Markdown from "metabase/core/components/Markdown";
import Tooltip from "metabase/core/components/Tooltip";

import ActionMenu from "metabase/collections/components/ActionMenu";
import ModelDetailLink from "metabase/models/components/ModelDetailLink";

import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import { IconName } from "metabase/core/components/Icon";
import Database from "metabase-lib/metadata/Database";

import {
  Body,
  Header,
  ActionsContainer,
  ItemCard,
  ItemIcon,
  ItemLink,
  Title,
  TruncatedMarkdown,
} from "./PinnedItemCard.styled";

type Props = {
  databases?: Database[];
  bookmarks?: Bookmark[];
  createBookmark: (id: string, collection: string) => void;
  deleteBookmark: (id: string, collection: string) => void;
  className?: string;
  item: CollectionItem;
  collection: Collection;
  onCopy: (items: CollectionItem[]) => void;
  onMove: (items: CollectionItem[]) => void;
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
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  className,
  item,
  collection,
  onCopy,
  onMove,
}: Props) {
  const [showTitleTooltip, setShowTitleTooltip] = useState(false);
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

  return (
    <ItemLink className={className} to={item.getUrl()}>
      <ItemCard flat>
        <Body>
          <Header>
            <ItemIcon name={icon as unknown as IconName} />
            <ActionsContainer>
              {item.model === "dataset" && <ModelDetailLink model={item} />}
              <ActionMenu
                databases={databases}
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
            tooltip={
              <Markdown disallowHeading unstyleLinks>
                {defaultedDescription ?? ""}
              </Markdown>
            }
          >
            <div>
              <TruncatedMarkdown disallowHeading unstyleLinks>
                {defaultedDescription ?? ""}
              </TruncatedMarkdown>
            </div>
          </Tooltip>
        </Body>
      </ItemCard>
    </ItemLink>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PinnedItemCard;
