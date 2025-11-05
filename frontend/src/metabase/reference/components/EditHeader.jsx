import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import RevisionMessageModal from "metabase/reference/components/RevisionMessageModal";

import S from "./EditHeader.module.css";

const EditHeader = ({
  hasRevisionHistory,
  endEditing,
  reinitializeForm = () => undefined,
  submitting,
  onSubmit,
  revisionMessageFormField,
}) => (
  <div className={cx(CS.wrapper, CS.px3, S.editHeader)}>
    <div className={S.editHeaderButtons}>
      <button
        type="button"
        className={cx(ButtonsS.Button, S.cancelButton)}
        onClick={() => {
          endEditing();
          reinitializeForm();
        }}
      >
        {t`Cancel`}
      </button>

      {hasRevisionHistory ? (
        <RevisionMessageModal
          action={() => onSubmit()}
          field={revisionMessageFormField}
          submitting={submitting}
        >
          <button
            className={cx(
              ButtonsS.Button,
              ButtonsS.ButtonPrimary,
              S.saveButton,
            )}
            type="button"
            disabled={submitting}
          >
            {t`Save`}
          </button>
        </RevisionMessageModal>
      ) : (
        <button
          className={cx(
            ButtonsS.Button,
            ButtonsS.ButtonPrimary,
            ButtonsS.ButtonWhite,
            S.saveButton,
          )}
          type="submit"
          disabled={submitting}
        >
          {t`Save`}
        </button>
      )}
    </div>
  </div>
);
EditHeader.propTypes = {
  hasRevisionHistory: PropTypes.bool,
  endEditing: PropTypes.func.isRequired,
  reinitializeForm: PropTypes.func,
  submitting: PropTypes.bool.isRequired,
  onSubmit: PropTypes.func,
  revisionMessageFormField: PropTypes.object,
};

export default memo(EditHeader);
