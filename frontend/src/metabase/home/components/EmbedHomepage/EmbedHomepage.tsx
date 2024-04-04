import { useMemo } from "react";

import { updateSetting } from "metabase/admin/settings/settings";
import { useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isEEBuild } from "metabase/lib/utils";
import { getDocsUrl, getSetting } from "metabase/selectors/settings";

import { EmbedHomepageView } from "./EmbedHomepageView";
import type { EmbedHomepageDismissReason } from "./types";

export const EmbedHomepage = () => {
  const dispatch = useDispatch();
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

  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  const defaultTab = useMemo(() => {
    // we want to show the interactive tab for EE builds
    // unless it's a starter cloud plan, which is EE build but doesn't have interactive embedding
    if (isEEBuild()) {
      return plan === "starter" ? "static" : "interactive";
    }
    return "static";
  }, [plan]);

  const onDismiss = (reason: EmbedHomepageDismissReason) => {
    dispatch(updateSetting({ key: "embedding-homepage", value: reason }));
  };

  return (
    <EmbedHomepageView
      onDismiss={onDismiss}
      exampleDashboardId={exampleDashboardId}
      embeddingAutoEnabled={embeddingAutoEnabled}
      licenseActiveAtSetup={licenseActiveAtSetup}
      defaultTab={defaultTab}
      interactiveEmbeddingQuickstartUrl={interactiveEmbeddingQuickStartUrl}
      embeddingDocsUrl={embeddingDocsUrl}
      // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
      analyticsDocsUrl="https://www.metabase.com/learn/customer-facing-analytics/"
      learnMoreInteractiveEmbedUrl={learnMoreInteractiveEmbedding}
      learnMoreStaticEmbedUrl={learnMoreStaticEmbedding}
    />
  );
};
