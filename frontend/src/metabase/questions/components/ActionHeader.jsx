/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import S from "./ActionHeader.css";

import StackedCheckBox from "metabase/components/StackedCheckBox.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import MoveToCollection from "../containers/MoveToCollection.jsx";

import LabelPopover from "../containers/LabelPopover.jsx";

const ActionHeader = ({ visibleCount, selectedCount, allAreSelected, sectionIsArchive, setAllSelected, setArchived, labels }) =>
    <div className={S.actionHeader}>
        <Tooltip tooltip={"Select all " + visibleCount} isEnabled={!allAreSelected}>
            <StackedCheckBox
                checked={allAreSelected}
                className="ml1"
                onChange={(e) => setAllSelected(e.target.checked)}
                size={20} padding={3} borderColor="currentColor"
                invertChecked
            />
        </Tooltip>
        <span className={S.selectedCount}>
            {selectedCount} selected
        </span>
        <span className="flex align-center flex-align-right">
            { !sectionIsArchive && labels.length > 0 ?
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
            <ModalWithTrigger
                full
                triggerElement={
                    <span className={S.actionButton} >
                        <Icon name="move" className="mr1" />
                        Move
                    </span>
                }
            >
                <MoveToCollection />
            </ModalWithTrigger>
            <span className={S.actionButton} onClick={() => setArchived(undefined, !sectionIsArchive, true)}>
                <Icon name={ sectionIsArchive ? "unarchive" : "archive" }  className="mr1" />
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
