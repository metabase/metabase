import { useState } from "react";
import { c, t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import {
  CollectionPickerModal,
  type CollectionPickerValueItem,
} from "metabase/common/components/Pickers/CollectionPicker";
import { Box, Flex, Icon, Text } from "metabase/ui";

import Styles from "./ArchivedEntityBanner.module.css";
import { BannerButton } from "./BannerButton";

type ArchivedEntityBannerProps = {
  name: string;
  entityType: string;
  canMove: boolean;
  canRestore: boolean;
  canDelete: boolean;
  onUnarchive: () => void;
  onMove: (collection: CollectionPickerValueItem) => void;
  onDeletePermanently: () => void;
};

export const ArchivedEntityBanner = ({
  name,
  entityType,
  canRestore,
  canMove,
  canDelete,
  onUnarchive,
  onMove,
  onDeletePermanently,
}: ArchivedEntityBannerProps) => {
  const [modal, setModal] = useState<"move" | "delete" | null>(null);
  const hasAction = canMove || canDelete || canRestore;

  return (
    <>
      <Box
        px="1.5rem"
        py=".75rem"
        bg="error"
        w="100%"
        data-testid="archive-banner"
      >
        <Flex justify="space-between">
          <Flex align="center">
            <Box
              style={{ marginInlineEnd: "1rem" }}
              display={{ base: "none", sm: "block" }}
              mt="2px"
            >
              <Icon className={Styles.iconStyle} name="trash_filled" />
            </Box>
            <Text color="text-primary-inverse" size="md" lh="1rem">
              {c(
                "{0} is the entity in the trash, e.g. collection, dashboard, etc.",
              ).t`This ${entityType} is in the trash.`}
            </Text>
          </Flex>
          {hasAction && (
            <Flex gap={{ base: "sm", sm: "md" }}>
              {canRestore && (
                <BannerButton iconName="revert" onClick={onUnarchive}>
                  {t`Restore`}
                </BannerButton>
              )}
              {canMove && (
                <BannerButton iconName="move" onClick={() => setModal("move")}>
                  {t`Move`}
                </BannerButton>
              )}
              {canDelete && (
                <BannerButton
                  iconName="trash"
                  onClick={() => setModal("delete")}
                >
                  {t`Delete permanently`}
                </BannerButton>
              )}
            </Flex>
          )}
        </Flex>
      </Box>
      {modal === "move" && (
        <CollectionPickerModal
          title={`Move ${name}`}
          value={{ id: "root", model: "collection" }}
          onChange={(collection) => onMove?.(collection)}
          options={{
            hasSearch: true,
            hasConfirmButtons: true,
            hasRootCollection: true,
            hasPersonalCollections: true,
            confirmButtonText: t`Move`,
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "delete" && (
        <ConfirmModal
          opened
          confirmButtonText={t`Delete permanently`}
          data-testid="delete-confirmation"
          message={t`This can't be undone.`}
          title={t`Delete ${name} permanently?`}
          onConfirm={onDeletePermanently}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
};
