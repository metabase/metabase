/* eslint-disable react/prop-types */
import { t } from "ttag";
import _ from "underscore";

import { useListSnippetsQuery } from "metabase/api";
import { useListSnippetCollectionsQuery } from "metabase/api/snippet-collection";
import { canonicalCollectionId } from "metabase/collections/utils";
import CS from "metabase/css/core/index.css";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import SidebarHeader from "metabase/query_builder/components/SidebarHeader";
import type { CollectionId, RegularCollectionId } from "metabase-types/api";

import { SnippetSidebarRow } from "../SnippetSidebarRow";

export const ArchivedSnippets = ({ onBack }: { onBack: () => void }) => {
  const { data: archivedSnippetCollections = [] } =
    useListSnippetCollectionsQuery({
      archived: true,
    });

  const { data: snippetCollections = [] } = useListSnippetCollectionsQuery({});

  const { data: snippets = [] } = useListSnippetsQuery({
    archived: true,
  });

  const getCollectionId = (id: CollectionId | null): RegularCollectionId => {
    return canonicalCollectionId(id) ?? -1;
  };

  const collectionsById = _.indexBy(
    snippetCollections.concat(archivedSnippetCollections),
    // we just need a placeholder when canonicalCollectionId returns 'null'
    c => getCollectionId(c.id),
  );

  return (
    <SidebarContent>
      <SidebarHeader
        className={CS.p2}
        title={t`Archived snippets`}
        onBack={onBack}
      />

      {archivedSnippetCollections.map(collection => (
        <SnippetSidebarRow
          key={`collection-${collection.id}`}
          item={collection}
          type="collection"
        />
      ))}
      {snippets.map(snippet => (
        <SnippetSidebarRow
          key={`snippet-${snippet.id}`}
          item={snippet}
          type="snippet"
          canWrite={
            collectionsById[getCollectionId(snippet.collection_id)].can_write
          }
        />
      ))}
    </SidebarContent>
  );
};
