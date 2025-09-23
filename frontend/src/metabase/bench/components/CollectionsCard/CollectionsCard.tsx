import { useEffect, useState } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Card, Checkbox, Stack, Text, Title } from "metabase/ui";
import type { Collection } from "metabase-types/api/collection";
import type { Transform } from "metabase-types/api/transform";

interface CollectionsCardProps {
  transform?: Transform;
}

const LOCAL_STORAGE_KEY_PREFIX = "mb-transform-collection-link-";

export function CollectionsCard({ transform }: CollectionsCardProps) {
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<
    Record<number, boolean>
  >({});
  const { data: collections, isLoading } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
  });

  // Load saved collection links from localStorage
  useEffect(() => {
    if (transform?.id && transform.table?.id) {
      try {
        const savedLinks = localStorage.getItem(
          `${LOCAL_STORAGE_KEY_PREFIX}${transform.table.id}`,
        );
        if (savedLinks) {
          const parsedLinks = JSON.parse(savedLinks);
          setSelectedCollectionIds(parsedLinks);
        } else {
          setSelectedCollectionIds({});
        }
      } catch (e) {
        console.error("Error loading collection links from localStorage", e);
        setSelectedCollectionIds({});
      }
    } else {
      setSelectedCollectionIds({});
    }
  }, [transform?.id, transform?.table?.id]);

  const handleToggleCollection = (collectionId: number) => {
    if (!transform?.id || !transform.table?.id) {
      return;
    }

    const newSelectedCollections = {
      ...selectedCollectionIds,
      [collectionId]: !selectedCollectionIds[collectionId],
    };

    // If the value is false, remove it from the object to keep it clean
    if (!newSelectedCollections[collectionId]) {
      delete newSelectedCollections[collectionId];
    }

    setSelectedCollectionIds(newSelectedCollections);

    // Save to localStorage
    try {
      localStorage.setItem(
        `${LOCAL_STORAGE_KEY_PREFIX}${transform.table.id}`,
        JSON.stringify(newSelectedCollections),
      );
    } catch (e) {
      console.error("Error saving collection links to localStorage", e);
    }
  };

  const renderCollections = (collections: Collection[], level = 0) => {
    return collections.map((collection) => (
      <Box key={collection.id} pl={level * 16} mb="xs">
        <Checkbox
          label={collection.name}
          checked={
            !!selectedCollectionIds[
              typeof collection.id === "number"
                ? collection.id
                : parseInt(String(collection.id), 10)
            ]
          }
          onChange={() =>
            handleToggleCollection(
              typeof collection.id === "number"
                ? collection.id
                : parseInt(String(collection.id), 10),
            )
          }
          disabled={!transform?.table?.id}
        />
        {collection.children && collection.children.length > 0 && (
          <Box mt="xs">{renderCollections(collection.children, level + 1)}</Box>
        )}
      </Box>
    ));
  };

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Card withBorder p="md">
      <Stack gap="md">
        <Title order={5}>Link to Collections</Title>

        <Text c="dimmed">Select collections to show this transform output</Text>

        {(!transform || !transform.table?.id) && (
          <Text c="red">
            The transform needs a target table to be linked with collections
          </Text>
        )}

        <Box style={{ maxHeight: 300, overflow: "auto" }}>
          <Stack gap="sm">
            {collections && renderCollections(collections)}
          </Stack>
        </Box>

        <Text c="dimmed" size="xs">
          Selected collections will display this transform output
        </Text>
      </Stack>
    </Card>
  );
}
