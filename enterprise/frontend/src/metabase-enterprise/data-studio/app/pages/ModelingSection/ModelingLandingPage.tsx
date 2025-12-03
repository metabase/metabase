import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionItemsQuery,
  useListCollectionsQuery,
  useListCollectionsTreeQuery,
  useListSnippetsQuery,
} from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  ActionIcon,
  Button,
  Card,
  FixedSizeIcon,
  Flex,
  Icon,
  Menu,
  Popover,
  Stack,
  TextInput,
} from "metabase/ui";

import { SectionLayout } from "../../components/SectionLayout";

import { getWritableCollection } from "./ModelingSidebar/LibrarySection/LibraryCollectionTree/utils";
import { Table } from "metabase-enterprise/data-studio/common/components/Table/Table";
import { useTreeFilter } from "metabase-enterprise/data-studio/common/components/Table/useTreeFilter";
import { buildCollectionTree } from "metabase/entities/collections";
import { buildSnippetTree } from "./ModelingSidebar/ModelingSidebarView/SnippetsSection/utils";
import { ForwardRefLink } from "metabase/common/components/Link";
import { CreateMenu } from "./CreateMenu";

export function ModelingLandingPage() {
  usePageTitle(t`Modeling`);
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState<string>();

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

  const handleItemSelect = useCallback(
    (item: ITreeNodeItem) => {
      console.log({ item });
      if (item.model === "dataset") {
        dispatch(push(Urls.dataStudioModel(item.id)));
      } else if (item.model === "metric") {
        dispatch(push(Urls.dataStudioMetric(item.id)));
      } else if (item.data?.model === "snippet") {
        dispatch(push(Urls.dataStudioSnippet(item.id)));
      }
    },
    [dispatch],
  );

  // if (loadingModels || loadingMetrics || loadingCollections) {
  //   return null;
  // }

  const modelsTree = {
    ...modelCollection,
    icon: "model",
    children:
      libraryModels?.data.map((x) => ({
        ...x,
        icon: "model",
        updated_at:
          x["last-edit-info"] &&
          new Date(x["last-edit-info"]?.timestamp).toDateString(),
      })) || [],
  };

  const metricsTree = {
    ...metricCollection,
    icon: "metric",
    children:
      libraryMetrics?.data.map((x) => ({
        ...x,
        icon: "metric",
        updated_at:
          x["last-edit-info"] &&
          new Date(x["last-edit-info"]?.timestamp).toDateString(),
      })) || [],
  };

  const { data: snippets = [] } = useListSnippetsQuery();
  const { data: snippetCollections = [] } = useListCollectionsQuery({
    namespace: "snippets",
  });

  const snippetTree = useMemo(
    () => buildSnippetTree(snippetCollections, snippets),
    [snippetCollections, snippets],
  );

  const filteredTree = useTreeFilter({
    data: [modelsTree, metricsTree, ...snippetTree],
    searchQuery,
    searchProps: ["name"],
  });

  return (
    <SectionLayout>
      {/* FIXME: Either make the table or page scrollable. Currently, scrolling the page scrolls the side nav. */}
      <Stack px="3.5rem" pt="4rem" bg="background-light" mih="100%">
        <Flex gap="0.5rem">
          <TextInput
            placeholder="Search..."
            leftSection={<Icon name="search" />}
            bdrs="md"
            flex="1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <CreateMenu
            metricCollectionId={metricCollection?.id}
            modelCollectionId={modelCollection?.id}
          />
        </Flex>

        <Table
          data={filteredTree}
          columns={[
            { id: "name", grow: true, name: "Name" },
            { id: "updated_at", width: "150px", name: "Updated At" },
          ]}
          onSelect={handleItemSelect}
        />
      </Stack>
    </SectionLayout>
  );
}
