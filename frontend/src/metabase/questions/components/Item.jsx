/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import S from "./List.css";

import Labels from "./Labels.jsx";
import LabelPopover from "../containers/LabelPopover.jsx";

import Icon from "metabase/components/Icon.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import Urls from "metabase/lib/urls";

import cx from "classnames";
import pure from "recompose/pure";

const Item = ({ id, name, created, by, selected, favorite, archived, icon, labels, setItemSelected, setFavorited, setArchived }) =>
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
        <ItemBody id={id} name={name} labels={labels} created={created} by={by} />
        { !archived ?
            <div className={S.rightIcons}>
                <LabelPopover
                    triggerElement={
                        <Tooltip tooltip={"Labels"}>
                            <Icon className={S.tagIcon} name="label" size={20} />
                        </Tooltip>
                    }
                    triggerClasses={S.trigger}
                    triggerClassesOpen={S.open}
                    item={{ id, labels }}
                />
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
    labels:             PropTypes.array.isRequired,
    setItemSelected:    PropTypes.func.isRequired,
    setFavorited:       PropTypes.func.isRequired,
    setArchived:        PropTypes.func.isRequired,
};

const ItemBody = pure(({ id, name, labels, created, by }) =>
    <div className={S.itemBody}>
        <div className={S.itemTitle}>
            <Link to={Urls.card(id)} className={S.itemName}>{name}</Link>
            <Labels labels={labels} />
        </div>
        <div className={cx(S.itemSubtitle, { "mt1" : labels.length === 0 })}>
          {`Created ${created} by ${by}`}
        </div>
    </div>
);

ItemBody.propTypes = {
    id:                 PropTypes.number.isRequired,
    name:               PropTypes.string.isRequired,
    created:            PropTypes.string.isRequired,
    by:                 PropTypes.string.isRequired,
    labels:             PropTypes.array.isRequired,
};

export default pure(Item);
