import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Card, Group, Icon } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { QueryView } from "../../../components/QueryView";
import { TitleSection } from "../../../components/TitleSection";
import { getTransformListUrl, getTransformQueryUrl } from "../../../urls";
import { isTransformRunning } from "../utils";

import { DeleteTransformModal } from "./DeleteTransformModal";

type ManageSectionProps = {
  transform: Transform;
};

export function ManageSection({ transform }: ManageSectionProps) {
  return (
    <TitleSection
      label={t`Query`}
      rightSection={
        <Group>
          <EditQueryButton transform={transform} />
          <DeleteTransformButton transform={transform} />
        </Group>
      }
    >
      <Card p={0} shadow="none" withBorder>
        <QueryView query={transform.source.query} />
      </Card>
    </TitleSection>
  );
}

type EditQueryButtonProps = {
  transform: Transform;
};

function EditQueryButton({ transform }: EditQueryButtonProps) {
  const isDisabled = isTransformRunning(transform);

  return (
    <Button
      component={isDisabled ? undefined : Link}
      to={getTransformQueryUrl(transform.id)}
      leftSection={<Icon name="pencil_lines" aria-hidden />}
      disabled={isDisabled}
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
      <Button
        leftSection={<Icon name="trash" aria-hidden />}
        disabled={isTransformRunning(transform)}
        onClick={openModal}
      >
        {t`Delete transform`}
      </Button>
      {isModalOpened && (
        <DeleteTransformModal
          transform={transform}
          onDelete={handleDelete}
          onClose={closeModal}
        />
      )}
    </>
  );
}
