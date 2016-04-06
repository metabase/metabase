import React, { Component, PropTypes } from "react";
import S from "./ActionHeader.css";

import StackedCheckBox from "metabase/components/StackedCheckBox.jsx";

const ActionHeader = ({ selectedCount, allSelected }) =>
    <div className={S.actionHeader}>
        <StackedCheckBox checked={allSelected} className={S.allCheckbox} size={20} padding={3} borderColor="currentColor" invertChecked />
        <span className={S.selectedCount}>
            {selectedCount} selected
        </span>
        <span className="flex-align-right">
            <span>Labels</span>
            <span>Archive</span>
        </span>
    </div>

export default ActionHeader;
