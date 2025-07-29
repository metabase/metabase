import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useConfirmation } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Icon } from "metabase/ui";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import { TransformTargetModal } from "metabase-enterprise/transforms/components/TransformTargetModal";
import { CardSection } from "metabase-enterprise/transforms/pages/TransformPage/TransformDetails/CardSection";
import { getTableMetadataUrl } from "metabase-enterprise/transforms/utils/urls";
import type { Transform, TransformTarget } from "metabase-types/api";

export type TargetSectionProps = {
  transform: Transform;
};

export function TargetSection({ transform }: TargetSectionProps) {
  return (
    <CardSection
      label={getSectionLabel(transform.target)}
      description={t`Change what this transform generates and where.`}
    >
      <Group p="lg">
        <EditTargetButton transform={transform} />
        <EditMetadataButton transform={transform} />
      </Group>
    </CardSection>
  );
}

function getSectionLabel(target: TransformTarget) {
  return match(target.type)
    .with("view", () => t`Generated view`)
    .with("table", () => t`Generated table`)
    .exhaustive();
}

type EditTargetButtonProps = {
  transform: Transform;
};

function EditTargetButton({ transform }: EditTargetButtonProps) {
  const { id, source, target } = transform;
  const [updateTransform] = useUpdateTransformMutation();
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();
  const [isOpened, { open, close }] = useDisclosure();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleUpdateTarget = (newTarget: TransformTarget) => {
    close();
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

  return (
    <>
      <Button leftSection={<Icon name="pencil_lines" />} onClick={open}>
        {t`Change target`}
      </Button>
      {source.query.database != null && (
        <TransformTargetModal
          databaseId={source.query.database}
          target={target}
          isOpened={isOpened}
          onSubmit={handleUpdateTarget}
          onClose={close}
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
          <strong key="name">{target.name}</strong>
        )}. Any queries that used this view won’t work any more. This can’t be undone, so please be careful.`,
    )
    .with(
      "table",
      () =>
        jt`This will delete the table, ${(
          <strong key="name">{target.name}</strong>
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

type EditMetadataButtonProps = {
  transform: Transform;
};

function EditMetadataButton({ transform }: EditMetadataButtonProps) {
  if (!transform.table) {
    return null;
  }

  return (
    <Button
      component={Link}
      to={getTableMetadataUrl(transform.table)}
      leftSection={<Icon name="label" />}
    >
      {t`Edit this view’s metadata`}
    </Button>
  );
}
