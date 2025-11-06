import type { Route } from "react-router";

import { skipToken, useGetSnippetQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { SnippetEditorPageBody } from "./SnippetEditorPageBody";

type SnippetEditorPageParams = {
  snippetId?: string;
};

type SnippetEditorPageProps = {
  params: SnippetEditorPageParams;
  route: Route;
};

export function SnippetEditorPage({ params, route }: SnippetEditorPageProps) {
  const snippetId =
    params.snippetId && params.snippetId !== "new"
      ? parseInt(params.snippetId, 10)
      : undefined;

  const {
    data: snippet,
    isFetching,
    error,
  } = useGetSnippetQuery(snippetId != null ? snippetId : skipToken);

  if (snippetId && (isFetching || error || !snippet)) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isFetching} error={error} />
      </Center>
    );
  }

  return (
    <SnippetEditorPageBody
      key={snippetId ?? "new"}
      initialSnippet={snippetId != null ? snippet : undefined}
      isNewSnippet={snippetId == null}
      route={route}
    />
  );
}
