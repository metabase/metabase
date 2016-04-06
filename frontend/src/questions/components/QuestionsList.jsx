import React, { Component, PropTypes } from "react";
import S from "./QuestionsList.css";

import Icon from "metabase/components/Icon.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";

import Labels from "./Labels.jsx";
import SearchHeader from "./SearchHeader.jsx";
import ActionHeader from "./ActionHeader.jsx";

import cx from "classnames";

const QuestionsList = ({ style, questions, name, selectedCount, allSelected }) =>
    <div style={style} className={S.list}>
        <div className={S.header}>
            {name}
        </div>
        { selectedCount === 0 ?
            <ActionHeader
                selectedCount={selectedCount}
                allSelected={allSelected}
            />
        :
            <SearchHeader />
        }
        <ul>
            { questions.map(question =>
                <QuestionItem {...question} />
            )}
        </ul>
    </div>

const QuestionItem = ({ name, created, by, checked, favorite, labels }) =>
    <li className={cx(S.item, { [S.checked]: checked, [S.favorite]: favorite })}>
        <div className={S.leftIcons}>
            <Icon className={S.chartIcon} name="line" width={30} height={30} />
            <CheckBox checked={checked} className={S.itemCheckbox} size={20} padding={3} borderColor="currentColor" invertChecked />
        </div>
        <div className={S.itemBody}>
            <div className={S.itemTitle}>
                <span className={S.itemName}>{name}</span>
                <Labels labels={labels} />
                <Icon className={S.tagIcon} name="grid" />
            </div>
            <div className={S.itemSubtitle}>Created <span className={S.itemSubtitleBold}>{created}</span> by <span className={S.itemSubtitleBold}>{by}</span></div>
        </div>
        <div className={S.rightIcons}>
            <Icon className={S.favoriteIcon} name="star" width={20} height={20} />
        </div>
        <div className={S.extraIcons}>
            <Icon className={S.archiveIcon} name="grid" width={20} height={20} />
        </div>
    </li>

export default QuestionsList;
