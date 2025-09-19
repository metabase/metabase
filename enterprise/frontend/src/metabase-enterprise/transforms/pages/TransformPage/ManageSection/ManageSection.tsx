import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Card, Group, Icon } from "metabase/ui";
import { PythonEditor } from "metabase-enterprise/transforms/components/PythonEditor";
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
  const sectionLabel =
    transform.source.type === "python" ? t`Python script` : t`Query`;

  return (
    <TitleSection
      label={sectionLabel}
      rightSection={
        <Group>
          <EditQueryButton transform={transform} />
          <DeleteTransformButton transform={transform} />
        </Group>
      }
    >
      <Card p={0} shadow="none" withBorder>
        {transform.source.type === "query" && (
          <QueryView query={transform.source.query} />
        )}
        {transform.source.type === "python" && (
          <PythonEditor value={transform.source.body} readOnly />
        )}
      </Card>
    </TitleSection>
  );
}

type EditQueryButtonProps = {
  transform: Transform;
};

function EditQueryButton({ transform }: EditQueryButtonProps) {
  const isDisabled = isTransformRunning(transform);
  const buttonText =
    transform.source.type === "python" ? t`Edit script` : t`Edit query`;

  return (
    <Button
      component={isDisabled ? undefined : Link}
      to={getTransformQueryUrl(transform.id)}
      leftSection={<Icon name="pencil_lines" aria-hidden />}
      disabled={isDisabled}
    >
      {buttonText}
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
