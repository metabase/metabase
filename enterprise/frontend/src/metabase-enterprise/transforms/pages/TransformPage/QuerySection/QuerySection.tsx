import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Icon } from "metabase/ui";
import { TitleSection } from "metabase-enterprise/transforms/components/TitleSection";
import {
  getTransformListUrl,
  getTransformQueryUrl,
} from "metabase-enterprise/transforms/urls";
import type { Transform } from "metabase-types/api";

import { DeleteTransformModal } from "./DeleteTransformModal";

type QuerySectionProps = {
  transform: Transform;
};

export function QuerySection({ transform }: QuerySectionProps) {
  return (
    <TitleSection
      label={t`Query`}
      rightSection={
        <Group>
          <EditQueryButton transform={transform} />
          <DeleteTransformButton transform={transform} />
        </Group>
      }
    />
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
    dispatch(push(getTransformListUrl()));
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
