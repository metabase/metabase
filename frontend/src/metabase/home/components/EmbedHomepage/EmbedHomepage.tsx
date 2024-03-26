import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";

import { EmbedHomepageView } from "./EmbedHomepageView";

export const EmbedHomepage = () => {
  const embeddingAutoEnabled = useSetting("setup-embedding-autoenabled");
  const licenseActiveAtSetup = useSetting("setup-license-active-at-setup");
  const exampleDashboardId = undefined; // will come from a setting

  const interactiveEmbeddingQuickStartUrl = useSelector(state =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
    getDocsUrl(state, {
      page: "embedding/interactive-embedding-quick-start-guide",
    }),
  );
  const embeddingDocsUrl = useSelector(state =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
    getDocsUrl(state, { page: "embedding/start" }),
  );

  const learnMoreInteractiveEmbedding = useSelector(state =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- this is only visible to admins
    getDocsUrl(state, { page: "embedding/interactive-embedding" }),
  );

  const learnMoreStaticEmbedding = useSelector(state =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- this is only visible to admins
    getDocsUrl(state, { page: "embedding/static-embedding" }),
  );

  return (
    <EmbedHomepageView
      exampleDashboardId={exampleDashboardId}
      embeddingAutoEnabled={embeddingAutoEnabled}
      licenseActiveAtSetup={licenseActiveAtSetup}
      plan="oss-starter"
      interactiveEmbeddingQuickstartUrl={interactiveEmbeddingQuickStartUrl}
      embeddingDocsUrl={embeddingDocsUrl}
      // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
      analyticsDocsUrl="https://www.metabase.com/learn/customer-facing-analytics/"
      learnMoreInteractiveEmbedUrl={learnMoreInteractiveEmbedding}
      learnMoreStaticEmbedUrl={learnMoreStaticEmbedding}
    />
  );
};
