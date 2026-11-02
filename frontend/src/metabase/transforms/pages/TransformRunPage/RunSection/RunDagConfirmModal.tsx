import { t } from "ttag";

import { skipToken, useListDagTransformsQuery } from "metabase/api";
import {
  ListSkeleton,
  LoadingSkeleton,
} from "metabase/common/components/Skeletons";
import { Button, List, Modal, ScrollArea, Stack, Text } from "metabase/ui";
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
  const { currentData: transforms, isFetching } = useListDagTransformsQuery(
    direction ? { transformId, direction } : skipToken,
  );
  const isLoadingTransforms = isFetching && transforms == null;

  const title =
    direction === "upstream"
      ? t`Run this and all upstream transforms?`
      : t`Run this and all downstream transforms?`;

  return (
    <Modal opened={direction != null} title={title} onClose={onClose}>
      <Stack gap="xl">
        <Text>{t`These transforms will be run:`}</Text>
        {isLoadingTransforms ? (
          <LoadingSkeleton>
            <ListSkeleton rows={4} iconSize={0} gap="md" />
          </LoadingSkeleton>
        ) : (
          <ScrollArea.Autosize mah="50vh">
            <List>
              {(transforms ?? []).map((transform) => (
                <List.Item key={transform.id}>{transform.name}</List.Item>
              ))}
            </List>
          </ScrollArea.Autosize>
        )}
      </Stack>
      <Modal.Footer>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          disabled={isFetching || isConfirming}
          onClick={onConfirm}
        >
          {t`Run all`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
