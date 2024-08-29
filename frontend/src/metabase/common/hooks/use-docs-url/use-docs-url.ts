import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

export const useDocsUrl = (path: string) => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const url = useSelector(state => getDocsUrl(state, { page: path }));

  return { url, showMetabaseLinks };
};
