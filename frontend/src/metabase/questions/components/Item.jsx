/* @flow */
/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import cx from "classnames";
import pure from "recompose/pure";
import { t } from "c-3po";
import S from "./List.css";

import Icon from "metabase/components/Icon.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import MoveToCollection from "../containers/MoveToCollection.jsx";
import CollectionBadge from "./CollectionBadge.jsx";

import * as Urls from "metabase/lib/urls";

const ITEM_ICON_SIZE = 20;

import type { Item as ItemType, Entity } from "../types";
import type { Collection } from "metabase/meta/types/Collection";
import type { Label } from "metabase/meta/types/Label";

type ItemProps = ItemType & {
  showCollectionName: boolean,
  setItemSelected: (selected: { [key: number]: boolean }) => void,
  setFavorited: (id: number, favorited: boolean) => void,
  setArchived: (id: number, archived: boolean, undoable: boolean) => void,
  onEntityClick: (entity: Entity) => void,
};

type ItemBodyProps = {
  entity: Entity,
  id: number,
  name: string,
  description: string,
  labels: Label[],
  favorite: boolean,
  collection: ?Collection,
  setFavorited: (id: number, favorited: boolean) => void,
  onEntityClick: (entity: Entity) => void,
};

type ItemCreatedProps = {
  created: string,
  by: string,
};

const Item = ({
  entity,
  id,
  name,
  description,
  created,
  by,
  favorite,
  collection,
  archived,
  icon,
  selected,
  setItemSelected,
  setFavorited,
  setArchived,
  showCollectionName,
  onEntityClick,
}: ItemProps) => (
  <div className={cx("hover-parent hover--visibility", S.item)}>
    <div className="flex flex-full align-center">
      <div
        className="relative flex ml1 mr2"
        style={{ width: ITEM_ICON_SIZE, height: ITEM_ICON_SIZE }}
      >
        {icon && (
          <Icon
            className={cx("text-light-blue absolute top left visible", {
              "hover-child--hidden": !!setItemSelected,
            })}
            name={icon}
            size={ITEM_ICON_SIZE}
          />
        )}
        {setItemSelected && (
          <span
            className={cx(
              "absolute top left",
              { visible: selected },
              { "hover-child": !selected },
            )}
          >
            <CheckBox
              checked={selected}
              onChange={e => setItemSelected({ [id]: e.target.checked })}
              size={ITEM_ICON_SIZE}
              padding={3}
            />
          </span>
        )}
      </div>
      <ItemBody
        entity={entity}
        id={id}
        name={name}
        description={description}
        favorite={favorite}
        collection={showCollectionName && collection}
        setFavorited={setFavorited}
        onEntityClick={onEntityClick}
      />
    </div>
    <div className="flex flex-column ml-auto">
      <ItemCreated by={by} created={created} />
      {setArchived && (
        <div className="hover-child mt1 ml-auto">
          <ModalWithTrigger
            full
            triggerElement={
              <Tooltip tooltip={t`Move to a collection`}>
                <Icon
                  className="text-light-blue cursor-pointer text-brand-hover transition-color mx2"
                  name="move"
                  size={18}
                />
              </Tooltip>
            }
          >
            <MoveToCollection
              questionId={id}
              initialCollectionId={collection && collection.id}
            />
          </ModalWithTrigger>
          <Tooltip tooltip={archived ? t`Unarchive` : t`Archive`}>
            <Icon
              className="text-light-blue cursor-pointer text-brand-hover transition-color"
              name={archived ? "unarchive" : "archive"}
              onClick={() => setArchived(id, !archived, true)}
              size={18}
            />
          </Tooltip>
        </div>
      )}
    </div>
  </div>
);

Item.propTypes = {
  entity: PropTypes.object.isRequired,
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  created: PropTypes.string.isRequired,
  description: PropTypes.string,
  by: PropTypes.string.isRequired,
  collection: PropTypes.object,
  selected: PropTypes.bool.isRequired,
  favorite: PropTypes.bool.isRequired,
  archived: PropTypes.bool.isRequired,
  icon: PropTypes.string.isRequired,
  setItemSelected: PropTypes.func,
  setFavorited: PropTypes.func,
  setArchived: PropTypes.func,
  onEntityClick: PropTypes.func,
  showCollectionName: PropTypes.bool,
};

const ItemBody = pure(
  ({
    entity,
    id,
    name,
    description,
    favorite,
    collection,
    setFavorited,
    onEntityClick,
  }: ItemBodyProps) => (
    <div className={S.itemBody}>
      <div className={cx("flex", S.itemTitle)}>
        <Link
          to={Urls.question(id)}
          className={cx(S.itemName)}
          onClick={
            onEntityClick &&
            (e => {
              e.preventDefault();
              onEntityClick(entity);
            })
          }
        >
          {name}
        </Link>
        {collection && <CollectionBadge collection={collection} />}
        {favorite != null &&
          setFavorited && (
            <Tooltip tooltip={favorite ? t`Unfavorite` : t`Favorite`}>
              <Icon
                className={cx(
                  "flex cursor-pointer",
                  { "hover-child text-light-blue text-brand-hover": !favorite },
                  { "visible text-gold": favorite },
                )}
                name={favorite ? "star" : "staroutline"}
                size={ITEM_ICON_SIZE}
                onClick={() => setFavorited(id, !favorite)}
              />
            </Tooltip>
          )}
      </div>
      <div
        className={cx(
          { "text-slate": description },
          { "text-light-blue": !description },
        )}
      >
        {description ? description : t`No description yet`}
      </div>
    </div>
  ),
);

ItemBody.propTypes = {
  description: PropTypes.string,
  favorite: PropTypes.bool.isRequired,
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  setFavorited: PropTypes.func,
};

const ItemCreated = pure(
  ({ created, by }: ItemCreatedProps) =>
    created || by ? (
      <div className={S.itemSubtitle}>
        {t`Created` + (created ? ` ${created}` : ``) + (by ? t` by ${by}` : ``)}
      </div>
    ) : null,
);

ItemCreated.propTypes = {
  created: PropTypes.string.isRequired,
  by: PropTypes.string.isRequired,
};

export default pure(Item);
