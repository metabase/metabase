import { Link } from "react-router";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useConfirmation } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Icon } from "metabase/ui";
import { useDeleteTransformMutation } from "metabase-enterprise/api";
import { CardSection } from "metabase-enterprise/transforms/pages/TransformPage/TransformDetails/CardSection";
import { getTransformQueryUrl } from "metabase-enterprise/transforms/utils/urls";
import type { Transform, TransformTarget } from "metabase-types/api";

export type ManageSectionProps = {
  transform: Transform;
};

export function ManageSection({ transform }: ManageSectionProps) {
  return (
    <CardSection
      label={t`Manage this transform`}
      description={t`Change what this transform generates and where.`}
    >
      <Group px="xl" py="lg">
        <Button leftSection={<Icon name="play" />}>{t`Run now`}</Button>
        <Button
          component={Link}
          to={getTransformQueryUrl(transform.id)}
          leftSection={<Icon name="pencil_lines" />}
        >
          {t`Edit query`}
        </Button>
        <DeleteButton transform={transform} />
      </Group>
    </CardSection>
  );
}

type DeleteButtonProps = {
  transform: Transform;
};

function DeleteButton({ transform }: DeleteButtonProps) {
  const { id, target } = transform;
  const [deleteTransform] = useDeleteTransformMutation();
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleDelete = () => {
    askConfirmation({
      title: getConfirmationTitle(target),
      message: getConfirmationMessage(target),
      confirmButtonText: getConfirmationButtonLabel(target),
      onConfirm: async () => {
        const { error } = await deleteTransform(id);
        if (error) {
          sendErrorToast("Failed to delete transform");
        } else {
          sendSuccessToast("Transform deleted");
        }
      },
    });
  };

  return (
    <>
      <Button leftSection={<Icon name="trash" />} onClick={handleDelete}>
        {t`Delete`}
      </Button>
      {confirmationModal}
    </>
  );
}

function getConfirmationTitle(target: TransformTarget) {
  return match(target.type)
    .with("view", () => t`Delete the transform and its view?`)
    .with("table", () => t`Delete the transform and its table?`)
    .exhaustive();
}

function getConfirmationMessage(target: TransformTarget) {
  return match(target.type)
    .with(
      "view",
      () =>
        jt`This will delete the transform and its generated view, ${(
          <strong key="name">${target.name}</strong>
        )}. Any queries that used this view won’t work any more. This can’t be undone, so please be careful.`,
    )
    .with(
      "table",
      () =>
        jt`This will delete the transform and its generated table, ${(
          <strong key="name">${target.name}</strong>
        )}. Any queries that used this view won’t work any more. This can’t be undone, so please be careful.`,
    )
    .exhaustive();
}

function getConfirmationButtonLabel(target: TransformTarget) {
  return match(target.type)
    .with("view", () => t`Delete the transform and its view`)
    .with("table", () => t`Delete the transform and its table`)
    .exhaustive();
}
