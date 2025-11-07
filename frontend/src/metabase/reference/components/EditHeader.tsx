import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { RevisionMessageModal } from "metabase/reference/components/RevisionMessageModal";

import S from "./EditHeader.module.css";

interface EditHeaderProps {
  hasRevisionHistory?: boolean;
  endEditing: () => void;
  reinitializeForm?: () => void;
  submitting: boolean;
  onSubmit?: () => void;
  revisionMessageFormField?: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    error?: string;
    name: string;
  };
}

export const EditHeader = memo(function EditHeader({
  hasRevisionHistory,
  endEditing,
  reinitializeForm = () => undefined,
  submitting,
  onSubmit = () => undefined,
  revisionMessageFormField,
}: EditHeaderProps) {
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  return (
    <>
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
            <button
              className={cx(
                ButtonsS.Button,
                ButtonsS.ButtonPrimary,
                S.saveButton,
              )}
              type="button"
              disabled={submitting}
              onClick={openModal}
            >
              {t`Save`}
            </button>
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

      {hasRevisionHistory && revisionMessageFormField && (
        <RevisionMessageModal
          opened={modalOpened}
          onClose={closeModal}
          action={onSubmit}
          field={revisionMessageFormField}
          submitting={submitting}
        />
      )}
    </>
  );
});
