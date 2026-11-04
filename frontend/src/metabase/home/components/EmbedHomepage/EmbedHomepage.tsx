import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { getDocsUrl, getSetting } from "metabase/selectors/settings";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

import { EmbedHomepageView } from "./EmbedHomepageView";
import { dismissEmbeddingHomepage } from "./actions";

export const EmbedHomepage = () => {
  const dispatch = useDispatch();
  const exampleDashboardId = useSetting("example-dashboard-id");
  const hasEmbeddingFeature = useHasTokenFeature("embedding");

  const embeddingDocsUrl = useSelector((state) =>
    // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- only visible to admins
    getDocsUrl(state, { page: "embedding/start" }),
  );

  const learnMoreInteractiveEmbedding = useSelector((state) =>
    // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- this is only visible to admins
    getDocsUrl(state, { page: "embedding/interactive-embedding" }),
  );

  const learnMoreStaticEmbedding = useSelector((state) =>
    // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- this is only visible to admins
    getDocsUrl(state, { page: "embedding/static-embedding" }),
  );

  const embedJsDocsUrl = useSelector((state) =>
    // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- this is only visible to admins
    getDocsUrl(state, { page: "embedding/embedded-analytics-js" }),
  );

  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );

  const utmTags = `?utm_source=product&source_plan=${plan}&utm_content=embedding-homepage`;

  const onDismiss = (reason: EmbeddingHomepageDismissReason) => {
    dispatch(dismissEmbeddingHomepage(reason));
  };

  const variant = PLUGIN_IS_EE_BUILD.isEEBuild() ? "ee" : "oss";

  return (
    <EmbedHomepageView
      onDismiss={onDismiss}
      exampleDashboardId={exampleDashboardId}
      embedJsDocsUrl={embedJsDocsUrl + utmTags}
      variant={variant}
      hasEmbeddingFeature={hasEmbeddingFeature}
      embeddingDocsUrl={embeddingDocsUrl + utmTags}
      analyticsDocsUrl={
        // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- only visible to admins
        "https://www.metabase.com/learn/customer-facing-analytics/" + utmTags
      }
      learnMoreInteractiveEmbedUrl={learnMoreInteractiveEmbedding + utmTags}
      learnMoreStaticEmbedUrl={learnMoreStaticEmbedding + utmTags}
      sdkQuickstartUrl={"https://metaba.se/sdk-quick-start" + utmTags}
      sdkDocsUrl={"https://metaba.se/sdk-docs" + utmTags}
    />
  );
};
