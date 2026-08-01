import { skipToken, useGetCollectionQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";

import { ContentView } from "../components/ContentView";
import { getCollectionSection } from "../content-target";
import { useContentStudioEntityScope } from "../scope";

type ContentStudioCollectionParams = {
  slug: string;
};

export function ContentStudioCollectionPage() {
  const { slug } = useParams<ContentStudioCollectionParams>();
  const collectionId = Urls.extractCollectionId(slug);

  const {
    data: collection,
    error,
    isLoading,
  } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

  useContentStudioEntityScope(
    collection ? (collection.worktree_id ?? null) : undefined,
    collection ? getCollectionSection(collection) : undefined,
  );

  if (collectionId == null) {
    return <NotFound />;
  }

  if (error || !collection) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ContentView
      key={collection.id}
      target={{ kind: "collection", collection }}
    />
  );
}
