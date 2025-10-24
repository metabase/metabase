import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Card, Group, Icon } from "metabase/ui";
import { PythonEditor } from "metabase-enterprise/transforms-python/components/PythonEditor";
import { useFlushTransformWatermarkMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { QueryView } from "../../../components/QueryView";
import { TitleSection } from "../../../components/TitleSection";
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
          <FlushWatermarkButton transform={transform} />
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
      to={Urls.transformQuery(transform.id)}
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

type FlushWatermarkButtonProps = {
  transform: Transform;
};

function FlushWatermarkButton({ transform }: FlushWatermarkButtonProps) {
  const [flushWatermark] = useFlushTransformWatermarkMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  // Only show for transforms with keyset incremental strategy
  const sourceStrategy = (transform.source as any)[
    "source-incremental-strategy"
  ];
  const hasKeysetStrategy = sourceStrategy?.type === "keyset";

  if (!hasKeysetStrategy) {
    return null;
  }

  const handleFlush = async () => {
    try {
      await flushWatermark(transform.id).unwrap();
      sendSuccessToast(t`Watermark flushed. The next run will recompute it.`);
    } catch (error) {
      sendErrorToast(t`Failed to flush watermark`);
    }
  };

  return (
    <Button
      leftSection={<Icon name="refresh" aria-hidden />}
      disabled={isTransformRunning(transform)}
      onClick={handleFlush}
    >
      {t`Flush watermark`}
    </Button>
  );
}

function DeleteTransformButton({ transform }: DeleteTransformButtonProps) {
  const dispatch = useDispatch();
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const { sendSuccessToast } = useMetadataToasts();

  const handleDelete = () => {
    sendSuccessToast(t`Transform deleted`);
    dispatch(push(Urls.transformList()));
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
