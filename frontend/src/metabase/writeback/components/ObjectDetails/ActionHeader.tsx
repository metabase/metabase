import ConfirmContent from "metabase/components/ConfirmContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Button from "metabase/core/components/Button";
import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

export interface ObjectDetailHeaderProps {
  isEditing: boolean;
  deleteRow?: () => void;
  onToggleEditingModeClick: () => void;
}

export default function ActionHeader({
  isEditing,
  deleteRow,
  onToggleEditingModeClick,
}: ObjectDetailHeaderProps): JSX.Element {
  const deleteRowModal = React.useRef() as any;
  return (
    <>
      {deleteRow ? (
        <ModalWithTrigger
          ref={deleteRowModal}
          triggerElement={
            <Button
              className="mr1"
              icon={"trash"}
              iconSize={20}
              onlyIcon
              borderless
            />
          }
        >
          <ConfirmContent
            title={t`Delete row`}
            content={""}
            onClose={() => deleteRowModal.current.toggle()}
            onAction={() => deleteRow()}
          />
        </ModalWithTrigger>
      ) : null}
      <Button
        className="mr1"
        icon={isEditing ? "eye" : "pencil"}
        onClick={onToggleEditingModeClick}
        iconSize={20}
        onlyIcon
        borderless
      />
    </>
  );
}
