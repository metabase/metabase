import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { RevisionMessageModal } from "metabase/reference/components/RevisionMessageModal";
import { Button } from "metabase/ui";

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
          <Button
            variant="outline"
            onClick={() => {
              endEditing();
              reinitializeForm();
            }}
          >
            {t`Cancel`}
          </Button>
          {hasRevisionHistory ? (
            <Button variant="filled" disabled={submitting} onClick={openModal}>
              {t`Save`}
            </Button>
          ) : (
            <Button type="submit" variant="filled" disabled={submitting}>
              {t`Save`}
            </Button>
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
