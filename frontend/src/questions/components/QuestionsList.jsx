import React, { Component, PropTypes } from "react";
import S from "./QuestionsList.css";

import SearchHeader from "./SearchHeader.jsx";
import ActionHeader from "./ActionHeader.jsx";
import QuestionItem from "./QuestionItem.jsx";

const QuestionsList = ({ style, questions, name, selectedCount, allSelected, searchText, setSearchText, setItemChecked }) =>
    <div style={style} className={S.list}>
        <div className={S.header}>
            {name}
        </div>
        { selectedCount > 0 ?
            <ActionHeader
                selectedCount={selectedCount}
                allSelected={allSelected}
            />
        :
            <SearchHeader searchText={searchText} setSearchText={setSearchText} />
        }
        <ul>
            { questions.map(question =>
                <QuestionItem key={question.id} {...question} setItemChecked={setItemChecked} />
            )}
        </ul>
    </div>

export default QuestionsList;
