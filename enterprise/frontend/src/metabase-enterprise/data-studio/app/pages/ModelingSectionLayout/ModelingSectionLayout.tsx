import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useListCollectionItemsQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Button, Card, Flex, Icon, Stack, TextInput } from "metabase/ui";

import { SectionLayout } from "../../components/SectionLayout";

import { getWritableCollection } from "./ModelingSidebar/LibrarySection/LibraryCollectionTree/utils";

export function ModelingSectionLayout() {
  usePageTitle(t`Modeling`);
  const dispatch = useDispatch();

  const { data: collections = [], isLoading: loadingCollections } =
    useListCollectionsTreeQuery({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
    });

  const libraryCollection = collections.find(isLibraryCollection);

  const modelCollection =
    libraryCollection &&
    getWritableCollection(libraryCollection, "library-models");

  const metricCollection =
    libraryCollection &&
    getWritableCollection(libraryCollection, "library-metrics");

  const { data: libraryModels, isLoading: loadingModels } =
    useListCollectionItemsQuery(
      modelCollection ? { id: modelCollection.id } : skipToken,
    );
  const { data: libraryMetrics, isLoading: loadingMetrics } =
    useListCollectionItemsQuery(
      metricCollection ? { id: metricCollection.id } : skipToken,
    );

  const handleCollectionSelect = useCallback(
    (item: ITreeNodeItem) => {
      if (item.model === "dataset") {
        dispatch(push(Urls.dataStudioModel(item.id)));
      } else if (item.model === "metric") {
        dispatch(push(Urls.dataStudioMetric(item.id)));
      }
    },
    [dispatch],
  );

  if (loadingModels || loadingMetrics || loadingCollections) {
    return null;
  }

  const modelsTree = {
    ...modelCollection,
    icon: "model",
    children: libraryModels?.data.map((x) => ({ ...x, icon: "model" })) || [],
  };

  const metricsTree = {
    ...metricCollection,
    icon: "metric",
    children: libraryMetrics?.data.map((x) => ({ ...x, icon: "metric" })) || [],
  };

  // Missing Snippets

  return (
    <SectionLayout>
      <Stack px="3.5rem" pt="4rem">
        <Flex gap="0.5rem">
          <TextInput
            placeholder="Search..."
            leftSection={<Icon name="search" />}
            bdrs="md"
            flex="1"
          />
          <Button leftSection={<Icon name="add" />}>{t`New`}</Button>
        </Flex>
        <Card withBorder>
          <Tree
            data={[modelsTree, metricsTree]}
            onSelect={handleCollectionSelect}
          />
        </Card>
      </Stack>
    </SectionLayout>
  );
}
