import { useCallback, useState } from "react";
import { t } from "ttag";

import { useCreateCollectionMutation } from "metabase/api";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { findLibraryCollection } from "metabase/data-studio/utils/library-collection";
import {
  Box,
  Button,
  Flex,
  Icon,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { ModelingSidebarSection } from "../../ModelingSidebarSection";

import S from "./LibrarySection.module.css";
import { LibraryTreeView } from "./LibraryTreeView";

interface LibrarySectionProps {
  collections: ITreeNodeItem[];
  selectedCollectionId?: string | number;
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
}

export function LibrarySection({
  collections,
  selectedCollectionId,
  hasDataAccess,
  hasNativeWrite,
}: LibrarySectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createCollection] = useCreateCollectionMutation();

  const libraryCollection = findLibraryCollection(collections);

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleCreateLibrary = useCallback(async () => {
    const libraryResult = await createCollection({
      name: "Library",
      parent_id: null,
    }).unwrap();

    const semanticLayerResult = await createCollection({
      name: "Semantic layer",
      parent_id: libraryResult.id,
    }).unwrap();

    await Promise.all([
      createCollection({
        name: "Models",
        parent_id: semanticLayerResult.id,
      }),
      createCollection({
        name: "Metrics",
        parent_id: semanticLayerResult.id,
      }),
    ]);

    setIsModalOpen(false);
  }, [createCollection]);

  if (libraryCollection) {
    return (
      <LibraryTreeView
        key={libraryCollection.id}
        libraryCollection={libraryCollection}
        selectedCollectionId={selectedCollectionId}
        hasDataAccess={hasDataAccess}
        hasNativeWrite={hasNativeWrite}
      />
    );
  }

  return (
    <>
      <ModelingSidebarSection
        icon="repository"
        title={t`Library`}
        onClick={handleOpenModal}
      />

      <Modal
        opened={isModalOpen}
        onClose={handleCloseModal}
        title={
          <Flex align="center" gap="sm">
            <Flex
              w={32}
              h={32}
              align="center"
              justify="center"
              bg="var(--mb-color-brand-lighter)"
              bdrs={8}
            >
              <Icon name="repository" size={16} c="brand" />
            </Flex>
            <Title order={3} fw="bold">{t`Create your Library`}</Title>
          </Flex>
        }
        size={560}
      >
        <Stack gap="md">
          <Text>
            {t`The Library helps you create a source of truth for analytics by providing a centrally managed set of curated content. It separates authoritative, reusable components from ad-hoc analyses.`}
          </Text>

          <Box component="ul" className={S.featureList}>
            <li>
              <Text>
                <Text component="span" fw="bold">
                  {t`Models:`}
                </Text>{" "}
                {t`Cleaned, pre-transformed data sources ready for exploring`}
              </Text>
            </li>
            <li>
              <Text>
                <Text component="span" fw="bold">
                  {t`Metrics:`}
                </Text>{" "}
                {t`Standardized calculations with known dimensions`}
              </Text>
            </li>
            <li>
              <Text>
                <Text component="span" fw="bold">
                  {t`Version control:`}
                </Text>{" "}
                {t`Sync your library to Git for governance`}
              </Text>
            </li>
            <li>
              <Text>
                <Text component="span" fw="bold">
                  {t`High trust:`}
                </Text>{" "}
                {t`Default to reliable sources your data team prescribes`}
              </Text>
            </li>
          </Box>

          <Flex gap="sm" justify="flex-end">
            <Button variant="subtle" onClick={handleCloseModal}>
              {t`Cancel`}
            </Button>
            <Button variant="filled" onClick={handleCreateLibrary}>
              {t`Create my library`}
            </Button>
          </Flex>
        </Stack>
      </Modal>
    </>
  );
}
