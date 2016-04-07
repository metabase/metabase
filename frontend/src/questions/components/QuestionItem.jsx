import React, { Component, PropTypes } from "react";
import S from "./QuestionsList.css";

import Labels from "./Labels.jsx";

import Icon from "metabase/components/Icon.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";

import cx from "classnames";
import pure from "recompose/pure";

const QuestionItem = ({ id, name, created, by, checked, favorite, iconName, labels, setItemChecked }) =>
    <li className={cx(S.item, { [S.checked]: checked, [S.favorite]: favorite })}>
        <div className={S.leftIcons}>
            { iconName && <Icon className={S.chartIcon} name={iconName} width={32} height={32} /> }
            <CheckBox
                checked={checked}
                onChange={(e) => setItemChecked({ [id]: e.target.checked })}
                className={S.itemCheckbox}
                size={20}
                padding={3}
                borderColor="currentColor"
                invertChecked
            />
        </div>
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
                <span className={S.itemSubtitleBold}>{by}</span></div>
        </div>
        <div className={S.rightIcons}>
            <Icon className={S.favoriteIcon} name="star" width={20} height={20} />
        </div>
        <div className={S.extraIcons}>
            <Icon className={S.archiveIcon} name="grid" width={20} height={20} />
        </div>
    </li>

export default pure(QuestionItem);
