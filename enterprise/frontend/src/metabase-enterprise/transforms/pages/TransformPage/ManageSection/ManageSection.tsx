import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Icon } from "metabase/ui";
import { CardSection } from "metabase-enterprise/transforms/components/CardSection";
import {
  getOverviewPageUrl,
  getTransformQueryUrl,
} from "metabase-enterprise/transforms/urls";
import type { Transform } from "metabase-types/api";

import { DeleteTransformModal } from "./DeleteTransformModal";

type ManageSectionProps = {
  transform: Transform;
};

export function ManageSection({ transform }: ManageSectionProps) {
  return (
    <CardSection
      label={t`Manage this transform`}
      description={t`Edit the query this transform runs, or delete the transform completely.`}
    >
      <Group p="lg">
        <EditQueryButton transform={transform} />
        <DeleteTransformButton transform={transform} />
      </Group>
    </CardSection>
  );
}

type EditQueryButtonProps = {
  transform: Transform;
};

function EditQueryButton({ transform }: EditQueryButtonProps) {
  return (
    <Button
      component={Link}
      to={getTransformQueryUrl(transform.id)}
      leftSection={<Icon name="pencil_lines" />}
    >
      {t`Edit query`}
    </Button>
  );
}

type DeleteTransformButtonProps = {
  transform: Transform;
};

function DeleteTransformButton({ transform }: DeleteTransformButtonProps) {
  const dispatch = useDispatch();
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const { sendSuccessToast } = useMetadataToasts();

  const handleDelete = () => {
    sendSuccessToast(t`Transform deleted`);
    dispatch(push(getOverviewPageUrl()));
  };

  return (
    <>
      <Button leftSection={<Icon name="trash" />} onClick={openModal}>
        {t`Delete`}
      </Button>
      {isModalOpened && (
        <DeleteTransformModal
          transform={transform}
          onDelete={handleDelete}
          onCancel={closeModal}
        />
      )}
    </>
  );
}
