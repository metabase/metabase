import React, { Component, PropTypes } from "react";
import S from "./List.css";

import Labels from "./Labels.jsx";

import Icon from "metabase/components/Icon.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";

import cx from "classnames";
import pure from "recompose/pure";

const Item = ({ id, name, created, by, selected, favorite, icon, labels, setItemSelected }) =>
    <div className={cx(S.item, { [S.selected]: selected, [S.favorite]: favorite })}>
        <div className={S.leftIcons}>
            { icon && <Icon className={S.chartIcon} name={icon} width={32} height={32} /> }
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
        <ItemBody name={name} labels={labels} created={created} by={by} />
        <div className={S.rightIcons}>
            <Icon className={S.favoriteIcon} name="star" width={20} height={20} />
        </div>
        <div className={S.extraIcons}>
            <Icon className={S.archiveIcon} name="grid" width={20} height={20} />
        </div>
    </div>

const ItemBody = pure(({ name, labels, created, by }) =>
    <div className={S.itemBody}>
        <div className={S.itemTitle}>
            <span className={S.itemName}>{name}</span>
            <Labels labels={labels} />
            <Icon className={S.tagIcon} name="grid" />
        </div>
        <div className={S.itemSubtitle}>
            {"Created "}
            <span className={S.itemSubtitleBold}>{created}</span>
            {" by "}
            <span className={S.itemSubtitleBold}>{by}</span>
        </div>
    </div>
)

export default pure(Item);
