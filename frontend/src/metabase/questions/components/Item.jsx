/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import S from "./List.css";

import Icon from "metabase/components/Icon.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import Urls from "metabase/lib/urls";

import cx from "classnames";
import pure from "recompose/pure";

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
        <ItemBody id={id} name={name} description={description} />
        <ItemCreated created={created} by={by} />
        { !archived ?
            <div className={S.rightIcons}>
                <Tooltip tooltip={favorite ? "Unfavorite" : "Favorite"}>
                    <Icon className={S.favoriteIcon} name="star" size={20} onClick={() => setFavorited(id, !favorite) }/>
                </Tooltip>
            </div>
        : null }
        <div className={S.extraIcons}>
            <Tooltip tooltip={archived ? "Unarchive" : "Archive"}>
                <Icon className={S.archiveIcon} name={ archived ? "unarchive" : "archive"} size={20} onClick={() => setArchived(id, !archived, true)} />
            </Tooltip>
        </div>
    </div>

Item.propTypes = {
    id:                 PropTypes.number.isRequired,
    name:               PropTypes.string.isRequired,
    created:            PropTypes.string.isRequired,
    by:                 PropTypes.string.isRequired,
    selected:           PropTypes.bool.isRequired,
    favorite:           PropTypes.bool.isRequired,
    archived:           PropTypes.bool.isRequired,
    icon:               PropTypes.string.isRequired,
    setItemSelected:    PropTypes.func.isRequired,
    setFavorited:       PropTypes.func.isRequired,
    setArchived:        PropTypes.func.isRequired,
};

const ItemBody = pure(({ id, name, description }) =>
    <div className={S.itemBody}>
        <div className={S.itemTitle}>
            <Link to={Urls.card(id)} className={S.itemName}>{name}</Link>
        </div>
        <div className={S.itemSubtitle}>
            {description && description}
        </div>
    </div>
);

ItemBody.propTypes = {
    id:                 PropTypes.number.isRequired,
    name:               PropTypes.string.isRequired,
    description:        PropTypes.string,
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
