import { skipToken, useGetSnippetQuery } from "metabase/api";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import { EditSnippetPage } from "metabase-enterprise/data-studio/library/snippets/pages/EditSnippetPage";

import { useContentStudioEntityScope } from "../scope";

type ContentStudioEditSnippetParams = {
  snippetId: string;
};

export function ContentStudioEditSnippetPage() {
  const { snippetId } = useParams<ContentStudioEditSnippetParams>();
  const id = Urls.extractEntityId(snippetId);
  const { data: snippet } = useGetSnippetQuery(id ?? skipToken);

  useContentStudioEntityScope(
    snippet ? (snippet.worktree_id ?? null) : undefined,
  );

  return <EditSnippetPage />;
}
