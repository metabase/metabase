import { useState } from "react";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useConfirmation } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Icon } from "metabase/ui";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform, TransformTarget } from "metabase-types/api";

import { TransformTargetModal } from "../../../../../components/TransformTargetModal";
import { getTableMetadataUrl } from "../../../../../utils/urls";

export type UpdateTargetButtonProps = {
  transform: Transform;
};

export function UpdateTargetButton({ transform }: UpdateTargetButtonProps) {
  const { id, source, target } = transform;
  const [updateTransform] = useUpdateTransformMutation();
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();
  const [isModalOpened, setIsModalOpened] = useState(false);
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleUpdateTarget = (newTarget: TransformTarget) => {
    askConfirmation({
      title: getConfirmationTitle(target),
      message: getConfirmationMessage(target),
      confirmButtonText: getConfirmationButtonLabel(target),
      onConfirm: async () => {
        const { error } = await updateTransform({ id, target: newTarget });
        if (error) {
          sendErrorToast("Failed to update transform");
        } else {
          sendSuccessToast("Transform updated");
        }
      },
    });
  };

  const handleModalOpen = () => {
    setIsModalOpened(false);
  };

  const handleModalClose = () => {
    setIsModalOpened(false);
  };

  return (
    <>
      <Button
        leftSection={<Icon name="pencil_lines" />}
        onClick={handleModalOpen}
      >
        {t`Change target`}
      </Button>
      {transform.table && (
        <Button
          component={Link}
          to={getTableMetadataUrl(transform.table)}
          leftSection={<Icon name="label" />}
        >
          {t`Edit this view’s metadata`}
        </Button>
      )}
      {source.query.database != null && (
        <TransformTargetModal
          databaseId={source.query.database}
          isOpened={isModalOpened}
          onSubmit={handleUpdateTarget}
          onClose={handleModalClose}
        />
      )}
      {confirmationModal}
    </>
  );
}

function getConfirmationTitle(target: TransformTarget) {
  return match(target.type)
    .with("view", () => t`Change target and delete the previous view?`)
    .with("table", () => t`Change target and delete the previous table?`)
    .exhaustive();
}

function getConfirmationMessage(target: TransformTarget) {
  return match(target.type)
    .with(
      "view",
      () =>
        jt`This will delete the view, ${(
          <strong key="name">${target.name}</strong>
        )}. Any queries that used this view won’t work any more. This can’t be undone, so please be careful.`,
    )
    .with(
      "table",
      () =>
        jt`This will delete the table, ${(
          <strong key="name">${target.name}</strong>
        )}. Any queries that used this view won’t work any more. This can’t be undone, so please be careful.`,
    )
    .exhaustive();
}

function getConfirmationButtonLabel(target: TransformTarget) {
  return match(target.type)
    .with("view", () => t`Change target and delete the previous view`)
    .with("table", () => t`Change target and delete the previous table`)
    .exhaustive();
}
