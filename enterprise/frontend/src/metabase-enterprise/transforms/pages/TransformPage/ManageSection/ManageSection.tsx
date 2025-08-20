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

import { DeleteTransformModal } from "./DeleteTransformModal";

type ManageSectionProps = {
  transform: Transform;
};

export function ManageSection({ transform }: ManageSectionProps) {
  const sectionLabel =
    transform.source.type === "python" ? t`Python Script` : t`Query`;

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
          <div style={{ padding: "1rem" }}>
            <p>
              <strong>{t`Database ID`}:</strong> {transform.source.database}
            </p>
            {transform.source.table && (
              <p>
                <strong>{t`Table ID`}:</strong> {transform.source.table}
              </p>
            )}
            <pre>{transform.source.script}</pre>
          </div>
        )}
      </Card>
    </TitleSection>
  );
}

type EditQueryButtonProps = {
  transform: Transform;
};

function EditQueryButton({ transform }: EditQueryButtonProps) {
  const buttonText =
    transform.source.type === "python" ? t`Edit script` : t`Edit query`;

  return (
    <Button
      component={Link}
      to={getTransformQueryUrl(transform.id)}
      leftSection={<Icon name="pencil_lines" aria-hidden />}
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
        onClick={openModal}
      >
        {t`Delete`}
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
