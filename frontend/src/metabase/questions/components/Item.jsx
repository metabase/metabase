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


const Item = ({ id, description, name, created, by, selected, favorite, archived, icon, setItemSelected, setFavorited, setArchived }) =>
    <div className={cx(S.item, { [S.selected]: selected, [S.favorite]: favorite, [S.archived]: archived })}>
        <div className={S.leftIcons}>
            { icon && <Icon className={S.chartIcon} name={icon} size={20} /> }
            <CheckBox
                checked={selected}
                onChange={(e) => setItemSelected({ [id]: e.target.checked })}
                className={S.itemCheckbox}
                size={20}
                padding={3}
                borderColor="currentColor"
                invertChecked
            />
        </div>
        <ItemBody
            description={description}
            id={id}
            name={name}
            setFavorited={setFavorited}
            favorite={favorite}
        />
        <div>
            <ItemCreated
                by={by}
                created={created}
            />
            <div className="ml-auto">
                <Tooltip tooltip={archived ? "Unarchive" : "Archive"}>
                    <Icon
                        className="cursor-pointer text-brand-hover transition-color"
                        name={ archived ? "unarchive" : "archive"}
                        onClick={() => setArchived(id, !archived, true)}
                        size={20}
                    />
                </Tooltip>
            </div>
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

const ItemBody = pure(({ id, name, description, favorite, setFavorited }) =>
    <div className={S.itemBody}>
        <div className={cx('flex align-center', S.itemTitle)}>
            <Link to={Urls.card(id)} className={cx(S.itemName)}>
                {name}
            </Link>
            <Tooltip tooltip={favorite ? "Unfavorite" : "Favorite"}>
                <Icon
                    className={S.favoriteIcon}
                    name="star" size={20}
                    onClick={() => setFavorited(id, !favorite) }
                />
            </Tooltip>
        </div>
        <div className={S.itemSubtitle}>
            {description && description}
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
