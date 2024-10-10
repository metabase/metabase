import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import type { Version } from "metabase-types/api";

export const useDocsUrl = (
  page: string,
  anchor?: string,
  version?: Version,
) => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const url = useSelector(state =>
    getDocsUrl(state, { page, anchor, version }),
  );

  return { url, showMetabaseLinks };
};
