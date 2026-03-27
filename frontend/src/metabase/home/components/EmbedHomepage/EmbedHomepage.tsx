import { useState } from "react";
import { t } from "ttag";

import { useSendProductFeedbackMutation } from "metabase/api/product-feedback";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isEEBuild } from "metabase/lib/utils";
import { addUndo } from "metabase/redux/undo";
import { getDocsUrl, getSetting } from "metabase/selectors/settings";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

import { EmbedHomepageView } from "./EmbedHomepageView";
import { FeedbackModal } from "./FeedbackModal";
import { dismissEmbeddingHomepage } from "./actions";

export const EmbedHomepage = () => {
  const [feedbackModalOpened, setFeedbackModalOpened] = useState(false);
  const dispatch = useDispatch();
  const exampleDashboardId = useSetting("example-dashboard-id");
  const [sendProductFeedback] = useSendProductFeedbackMutation();
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

  const variant = isEEBuild() ? "ee" : "oss";

  return (
    <>
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
      <FeedbackModal
        opened={feedbackModalOpened}
        onClose={() => setFeedbackModalOpened(false)}
        onSubmit={onFeedbackSubmit}
      />
    </>
  );
};
