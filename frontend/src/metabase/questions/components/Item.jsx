/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import cx from "classnames";
import pure from "recompose/pure";

import S from "./List.css";

import Icon from "metabase/components/Icon.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import Urls from "metabase/lib/urls";

const ITEM_ICON_SIZE = 20;

const Item = ({ entity, id, description, name, created, by, selected, favorite, archived, icon, setItemSelected, setFavorited, setArchived, onEntityClick }) =>
    <div className={cx('hover-parent hover--visibility', S.item)}>
        <div className="flex flex-full align-center">
            <div className="relative flex ml1 mr2" style={{ width: ITEM_ICON_SIZE, height: ITEM_ICON_SIZE }}>
                { icon &&
                    <Icon
                        className={cx("text-light-blue absolute top left visible", { "hover-child--hidden": !!setItemSelected })}
                        name={icon}
                        size={ITEM_ICON_SIZE}
                    />
                }
                { setItemSelected &&
                    <CheckBox
                        className={cx(
                            "cursor-pointer absolute top left",
                            { "visible text-brand": selected },
                            { "hover-child text-brand-hover text-light-blue transition-color": !selected }
                        )}
                        checked={selected}
                        onChange={(e) => setItemSelected({ [id]: e.target.checked })}
                        size={ITEM_ICON_SIZE}
                        padding={3}
                        borderColor="currentColor"
                        invertChecked
                    />
                }
            </div>
            <ItemBody
                entity={entity}
                description={description}
                id={id}
                name={name}
                setFavorited={setFavorited}
                favorite={favorite}
                onEntityClick={onEntityClick}
            />
        </div>
        <div className="flex flex-column ml-auto">
            <ItemCreated
                by={by}
                created={created}
            />
            { setArchived &&
                <div className="hover-child mt1 ml-auto">
                    <Tooltip tooltip="Move to a collection">
                        <Link to={`/questions/${id}/move`}>
                            <Icon
                                className="text-light-blue cursor-pointer text-brand-hover transition-color mx2"
                                name="move"
                                size={18}
                            />
                        </Link>
                    </Tooltip>
                    <Tooltip tooltip={archived ? "Unarchive" : "Archive"}>
                        <Icon
                            className="text-light-blue cursor-pointer text-brand-hover transition-color"
                            name={ archived ? "unarchive" : "archive"}
                            onClick={() => setArchived(id, !archived, true)}
                            size={18}
                        />
                    </Tooltip>
                </div>
            }
        </div>
    </div>

Item.propTypes = {
    id:                 PropTypes.number.isRequired,
    name:               PropTypes.string.isRequired,
    created:            PropTypes.string.isRequired,
    description:        PropTypes.string,
    by:                 PropTypes.string.isRequired,
    selected:           PropTypes.bool.isRequired,
    favorite:           PropTypes.bool.isRequired,
    archived:           PropTypes.bool.isRequired,
    icon:               PropTypes.string.isRequired,
    setItemSelected:    PropTypes.func.isRequired,
    setFavorited:       PropTypes.func.isRequired,
    setArchived:        PropTypes.func.isRequired,
};

const ItemBody = pure(({ entity, id, name, description, favorite, setFavorited, onEntityClick }) =>
    <div className={S.itemBody}>
        <div className={cx('flex', S.itemTitle)}>
            <Link to={Urls.card(id)} className={cx(S.itemName)} onClick={onEntityClick && ((e) => { e.preventDefault(); onEntityClick(entity); })}>
                {name}
            </Link>
            { setFavorited &&
                <Tooltip tooltip={favorite ? "Unfavorite" : "Favorite"}>
                    <Icon
                        className={cx(
                            "flex cursor-pointer text-brand-hover transition-color",
                            {"hover-child text-light-blue": !favorite},
                            {"visible text-brand": favorite}
                        )}
                        name={favorite ? "star" : "staroutline"}
                        size={ITEM_ICON_SIZE}
                        onClick={() => setFavorited(id, !favorite) }
                    />
                </Tooltip>
            }
        </div>
        <div className={S.itemSubtitle}>
            {description}
        </div>
    </div>
);

ItemBody.propTypes = {
    description:        PropTypes.string,
    favorite:           PropTypes.bool.isRequired,
    id:                 PropTypes.number.isRequired,
    name:               PropTypes.string.isRequired,
    setFavorited:       PropTypes.func.isRequired,
};

const ItemCreated = pure(({ created, by }) =>
    <div className={S.itemSubtitle}>
      {`Created ${created} by ${by}`}
  </div>
);

ItemCreated.propTypes = {
    created:            PropTypes.string.isRequired,
    by:                 PropTypes.string.isRequired,
};

export default pure(Item);
