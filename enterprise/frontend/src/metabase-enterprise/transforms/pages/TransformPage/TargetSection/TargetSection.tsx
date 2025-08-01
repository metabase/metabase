import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Icon } from "metabase/ui";
import { CardSection } from "metabase-enterprise/transforms/components/CardSection";
import { getTableMetadataUrl } from "metabase-enterprise/transforms/urls";
import type { Transform, TransformTarget } from "metabase-types/api";

import { UpdateTargetModal } from "./UpdateTargetModal";

type TargetSectionProps = {
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

function getSectionLabel({ type }: TransformTarget) {
  return match(type)
    .with("view", () => t`Generated view`)
    .with("table", () => t`Generated table`)
    .exhaustive();
}

type EditTargetButtonProps = {
  transform: Transform;
};

function EditTargetButton({ transform }: EditTargetButtonProps) {
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const { sendSuccessToast } = useMetadataToasts();

  const handleUpdate = () => {
    closeModal();
    sendSuccessToast(t`Transform target updated`);
  };

  return (
    <>
      <Button leftSection={<Icon name="pencil_lines" />} onClick={openModal}>
        {t`Change target`}
      </Button>
      {isModalOpened && (
        <UpdateTargetModal
          transform={transform}
          onUpdate={handleUpdate}
          onCancel={closeModal}
        />
      )}
    </>
  );
}

type EditMetadataButtonProps = {
  transform: Transform;
};

function EditMetadataButton({ transform }: EditMetadataButtonProps) {
  if (transform.table == null) {
    return null;
  }

  return (
    <Button
      component={Link}
      to={getTableMetadataUrl(transform.table)}
      leftSection={<Icon name="label" />}
    >
      {getEditButtonLabel(transform.target)}
    </Button>
  );
}

function getEditButtonLabel({ type }: TransformTarget) {
  return match(type)
    .with("view", () => t`Edit this view’s metadata`)
    .with("table", () => t`Edit this table’s metadata`)
    .exhaustive();
}
