import { useSelector } from "metabase/lib/redux";
import { type UtmProps, getDocsUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

type DocsUtmProps = Omit<UtmProps, "utm_medium"> & {
  utm_medium?: UtmProps["utm_medium"];
};

export const useDocsUrl = (
  page: string,
  anchor?: string,
  utm?: DocsUtmProps,
) => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const url = useSelector(state =>
    getDocsUrl(state, {
      page,
      anchor,
      utm: utm && {
        ...utm,
        utm_medium: utm.utm_medium ?? "docs",
      },
    }),
  );

  return { url, showMetabaseLinks };
};
