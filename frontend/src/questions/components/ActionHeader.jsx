import React, { Component, PropTypes } from "react";
import S from "./ActionHeader.css";

import StackedCheckBox from "metabase/components/StackedCheckBox.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";

import LabelPopover from "./LabelPopover.jsx";

const ActionHeader = ({ selectedCount, allSelected, setAllSelected, archiveSelected }) =>
    <div className={S.actionHeader}>
        <StackedCheckBox
            checked={allSelected}
            onChange={(e) => setAllSelected(e.target.checked)}
            className={S.allCheckbox}
            size={20} padding={3} borderColor="currentColor"
            invertChecked
        />
        <span className={S.selectedCount}>
            {selectedCount} selected
        </span>
        <span className="flex-align-right">
            <PopoverWithTrigger
                triggerElement={
                    <span className={S.labelButton}>
                        <Icon name="grid" />
                        Labels
                        <Icon name="chevrondown" width={12} height={12} />
                    </span>
                }
            >
                <LabelPopover />
            </PopoverWithTrigger>
            <span className={S.archiveButton} onClick={archiveSelected}>
                <Icon name="grid" />
                Archive
            </span>
        </span>
    </div>



export default ActionHeader;
