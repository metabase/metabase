import { skipToken, useGetTransformQuery } from "metabase/api";
import { Outlet, useParams } from "metabase/router";
import * as Urls from "metabase/urls";

import { useContentStudioEntityScope } from "../scope";

type ContentStudioTransformParams = {
  transformId: string;
};

/** Keeps the studio on the branch the open transform belongs to. */
export function ContentStudioTransformLayout() {
  const { transformId } = useParams<ContentStudioTransformParams>();
  const id = Urls.extractEntityId(transformId);
  const { data: transform } = useGetTransformQuery(id ?? skipToken);

  useContentStudioEntityScope(
    transform ? (transform.worktree_id ?? null) : undefined,
  );

  return <Outlet />;
}
