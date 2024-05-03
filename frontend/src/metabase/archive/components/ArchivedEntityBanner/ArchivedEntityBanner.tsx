import { useState } from "react";
import { c, t } from "ttag";

import { CollectionPickerModal } from "metabase/common/components/CollectionPicker";
import { Button, Flex, FixedSizeIcon, Paper, Text } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { DeleteConfirmModal } from "../DeleteConfirmModal";

type ArchivedEntityBannerProps = {
  name: string;
  entityType: string;
  canWrite: boolean;
  canRestore: boolean;
  onUnarchive: () => void;
  onMove: (id: CollectionId) => void;
  onDeletePermanently: () => void;
};

export const ArchivedEntityBanner = ({
  name,
  entityType,
  canRestore,
  canWrite,
  onUnarchive,
  onMove,
  onDeletePermanently,
}: ArchivedEntityBannerProps) => {
  const [modal, setModal] = useState<"move" | "delete" | null>(null);

  return (
    <>
      <Paper
        px="1.5rem"
        py=".75rem"
        bg="error"
        shadow="0"
        radius="0"
        w="100%"
        data-testid="archive-banner"
      >
        <Flex justify="space-between">
          <Flex align="center">
            <FixedSizeIcon
              color="white"
              name="trash_filled"
              style={{ marginInlineEnd: "1rem" }}
            />
            <Text color="white" size="md" lh="1rem">
              {c(
                "{0} is the entity in the trash, e.g. collection, dashboard, etc.",
              ).t`This ${entityType} is in the trash.`}
            </Text>
          </Flex>
          {canWrite && (
            <Flex gap="md">
              {canRestore && (
                <Button
                  compact
                  variant="outline"
                  color="white"
                  onClick={onUnarchive}
                >
                  <Flex align="center" gap="sm">
                    <FixedSizeIcon size={12} name="revert" />
                    {t`Restore`}
                  </Flex>
                </Button>
              )}
              <Button
                compact
                variant="outline"
                color="white"
                onClick={() => setModal("move")}
              >
                <Flex align="center" gap="sm">
                  <FixedSizeIcon size={12} name="move" />
                  {t`Move`}
                </Flex>
              </Button>
              <Button
                compact
                variant="outline"
                color="white"
                onClick={() => setModal("delete")}
              >
                <Flex align="center" gap="sm">
                  <FixedSizeIcon size={12} name="trash" />
                  {t`Delete permanently`}
                </Flex>
              </Button>
            </Flex>
          )}
        </Flex>
      </Paper>
      {modal === "move" && (
        <CollectionPickerModal
          title={`Move ${name}`}
          value={{ id: "root", model: "collection" }}
          onChange={({ id }) => onMove?.(id)}
          options={{
            showSearch: true,
            hasConfirmButtons: true,
            showRootCollection: true,
            showPersonalCollections: true,
            confirmButtonText: t`Move`,
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "delete" && (
        <DeleteConfirmModal
          name={name}
          onCloseModal={() => setModal(null)}
          onDelete={onDeletePermanently}
        />
      )}
    </>
  );
};
