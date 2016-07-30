import React, { Component, PropTypes } from "react";
import cx from "classnames";
import pure from "recompose/pure";

import S from "./EditHeader.css";

import RevisionMessageModal from "metabase/reference/components/RevisionMessageModal.jsx";

const EditHeader = ({
    hasRevisionHistory,
    onSubmit,
    endEditing,
    submitting,
    revisionMessageFormField
}) =>
    <div className={cx("EditHeader wrapper py1", S.editHeader)}>
        <div>
            You are editing this page
        </div>
        <div className={S.editHeaderButtons}>
            { hasRevisionHistory ?
                <RevisionMessageModal
                    action={() => onSubmit()}
                    field={revisionMessageFormField}
                    submitting={submitting}
                >
                    <button
                        className={cx("Button", "Button--primary", "Button--white", "Button--small", S.saveButton)}
                        type="button"
                        disabled={submitting}
                    >
                        SAVE
                    </button>
                </RevisionMessageModal> :
                <button
                    className={cx("Button", "Button--primary", "Button--white", "Button--small", S.saveButton)}
                    type="submit"
                    disabled={submitting}
                >
                    SAVE
                </button>
            }

            <button
                type="button"
                className={cx("Button", "Button--white", "Button--small", S.cancelButton)}
                onClick={endEditing}
            >
                CANCEL
            </button>
        </div>
    </div>;
EditHeader.propTypes = {
    hasRevisionHistory: PropTypes.bool.isRequired,
    onSubmit: PropTypes.func.isRequired,
    endEditing: PropTypes.func.isRequired,
    submitting: PropTypes.bool.isRequired,
    revisionMessageFormField: PropTypes.object.isRequired
};

export default pure(EditHeader);
