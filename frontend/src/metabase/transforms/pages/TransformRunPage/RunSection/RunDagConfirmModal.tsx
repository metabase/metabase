import { t } from "ttag";

import { skipToken, useListDagTransformsQuery } from "metabase/api";
import {
  Button,
  Center,
  Group,
  List,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from "metabase/ui";
import type { TransformDagDirection, TransformId } from "metabase-types/api";

type RunDagConfirmModalProps = {
  transformId: TransformId;
  direction: TransformDagDirection | null;
  isConfirming?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function RunDagConfirmModal({
  transformId,
  direction,
  isConfirming,
  onClose,
  onConfirm,
}: RunDagConfirmModalProps) {
  const { data: transforms, isFetching } = useListDagTransformsQuery(
    direction ? { transformId, direction } : skipToken,
  );

  const title =
    direction === "upstream"
      ? t`Run this and all upstream transforms?`
      : t`Run this and all downstream transforms?`;

  return (
    <Modal
      opened={direction != null}
      title={title}
      padding="xl"
      onClose={onClose}
    >
      <Stack gap="lg">
        <Text>{t`These transforms will be run:`}</Text>
        {isFetching ? (
          <Center py="lg">
            <Loader />
          </Center>
        ) : (
          <ScrollArea.Autosize mah="50vh">
            <List>
              {(transforms ?? []).map((transform) => (
                <List.Item key={transform.id}>{transform.name}</List.Item>
              ))}
            </List>
          </ScrollArea.Autosize>
        )}
        <Group justify="flex-end">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            disabled={isFetching || isConfirming}
            onClick={onConfirm}
          >
            {t`Run all`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
