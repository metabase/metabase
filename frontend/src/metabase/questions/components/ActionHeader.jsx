/* eslint "react/prop-types": "warn" */
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
        <span className="flex align-center flex-align-right">
            { !sectionIsArchive ?
                <LabelPopover
                    triggerElement={
                        <span className={S.actionButton}>
                            <Icon name="label" />
                            Labels
                            <Icon name="chevrondown" size={12} />
                        </span>
                    }
                    labels={labels}
                    count={selectedCount}
                />
            : null }
            <span className={S.actionButton} onClick={() => setArchived(undefined, !sectionIsArchive, true)}>
                <Icon name={ sectionIsArchive ? "unarchive" : "archive" } />
                { sectionIsArchive ? "Unarchive" : "Archive" }
            </span>
        </span>
    </div>

ActionHeader.propTypes = {
    labels:             PropTypes.array.isRequired,
    visibleCount:       PropTypes.number.isRequired,
    selectedCount:      PropTypes.number.isRequired,
    allAreSelected:     PropTypes.bool.isRequired,
    sectionIsArchive:   PropTypes.bool.isRequired,
    setAllSelected:     PropTypes.func.isRequired,
    setArchived:        PropTypes.func.isRequired,
};

export default ActionHeader;
