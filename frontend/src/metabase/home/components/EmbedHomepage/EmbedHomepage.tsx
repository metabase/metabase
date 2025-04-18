import { useState } from "react";
import { t } from "ttag";

import { useSendProductFeedbackMutation } from "metabase/api/product-feedback";
import { useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { getDocsUrl, getSetting } from "metabase/selectors/settings";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

import { EmbedHomepageView } from "./EmbedHomepageView";
import { FeedbackModal } from "./FeedbackModal";
import { dismissEmbeddingHomepage } from "./actions";

export const EmbedHomepage = () => {
  const [feedbackModalOpened, setFeedbackModalOpened] = useState(false);
  const dispatch = useDispatch();
  const licenseActiveAtSetup = useSetting("setup-license-active-at-setup");
  const exampleDashboardId = useSetting("example-dashboard-id");
  const [sendProductFeedback] = useSendProductFeedbackMutation();

  const interactiveEmbeddingQuickStartUrl = useSelector((state) =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
    getDocsUrl(state, {
      page: "embedding/interactive-embedding-quick-start-guide",
    }),
  );
  const embeddingDocsUrl = useSelector((state) =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
    getDocsUrl(state, { page: "embedding/start" }),
  );

  const learnMoreInteractiveEmbedding = useSelector((state) =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- this is only visible to admins
    getDocsUrl(state, { page: "embedding/interactive-embedding" }),
  );

  const learnMoreStaticEmbedding = useSelector((state) =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- this is only visible to admins
    getDocsUrl(state, { page: "embedding/static-embedding" }),
  );

  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );

  const utmTags = `?utm_source=product&source_plan=${plan}&utm_content=embedding-homepage`;

  const onDismiss = (reason: EmbeddingHomepageDismissReason) => {
    if (reason === "dismissed-run-into-issues") {
      setFeedbackModalOpened(true);
    } else {
      dispatch(dismissEmbeddingHomepage(reason));
    }
  };

  const onFeedbackSubmit = ({
    comment,
    email,
  }: {
    comment?: string;
    email?: string;
  }) => {
    dispatch(dismissEmbeddingHomepage("dismissed-run-into-issues"));

    setFeedbackModalOpened(false);
    if (comment || email) {
      sendProductFeedback({
        comment,
        email: email,
        source: "embedding-homepage-dismiss",
      });
      dispatch(
        addUndo({ message: t`Your feedback was submitted, thank you.` }),
      );
    }
  };

  return (
    <>
      <EmbedHomepageView
        onDismiss={onDismiss}
        exampleDashboardId={exampleDashboardId}
        licenseActiveAtSetup={licenseActiveAtSetup}
        interactiveEmbeddingQuickstartUrl={
          interactiveEmbeddingQuickStartUrl + utmTags
        }
        embeddingDocsUrl={embeddingDocsUrl + utmTags}
        analyticsDocsUrl={
          // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
          "https://www.metabase.com/learn/customer-facing-analytics/" + utmTags
        }
        learnMoreInteractiveEmbedUrl={learnMoreInteractiveEmbedding + utmTags}
        learnMoreStaticEmbedUrl={learnMoreStaticEmbedding + utmTags}
        sdkQuickstartUrl={"https://metaba.se/sdk-quick-start" + utmTags}
        sdkDocsUrl={"https://metaba.se/sdk-docs" + utmTags}
      />
      <FeedbackModal
        opened={feedbackModalOpened}
        onClose={() => setFeedbackModalOpened(false)}
        onSubmit={onFeedbackSubmit}
      />
    </>
  );
};
