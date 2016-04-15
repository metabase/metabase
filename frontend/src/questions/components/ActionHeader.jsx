import React, { Component, PropTypes } from "react";
import S from "./ActionHeader.css";

import StackedCheckBox from "metabase/components/StackedCheckBox.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import LabelPopover from "../containers/LabelPopover.jsx";

import cx from "classnames";

const ActionHeader = ({ visibleCount, selectedCount, allAreSelected, sectionIsArchive, setAllSelected, setArchived, labels }) =>
    <div className={S.actionHeader}>
        <Tooltip tooltip={"Select all " + visibleCount} isEnabled={!allAreSelected}>
            <StackedCheckBox
                checked={allAreSelected}
                onChange={(e) => setAllSelected(e.target.checked)}
                className={cx(S.allCheckbox, { [S.selected]: allAreSelected })}
                size={20} padding={3} borderColor="currentColor"
                invertChecked
            />
        </Tooltip>
        <span className={S.selectedCount}>
            {selectedCount} selected
        </span>
        <span className="flex-align-right">
            <LabelPopover
                triggerElement={
                    <span className={S.labelButton}>
                        <Icon name="grid" />
                        Labels
                        <Icon name="chevrondown" width={12} height={12} />
                    </span>
                }
                labels={labels}
            />
            <span className={S.archiveButton} onClick={() => setArchived(undefined, !sectionIsArchive, true)}>
                <Icon name="grid" />
                { sectionIsArchive ? "Unarchive" : "Archive" }
            </span>
        </span>
    </div>



export default ActionHeader;
