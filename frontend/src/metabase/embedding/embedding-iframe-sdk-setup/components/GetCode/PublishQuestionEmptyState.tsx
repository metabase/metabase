import { jt, t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import EmptyState from "metabase/common/components/EmptyState";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { useToggleResourceEmbedding } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-toggle-resource-embedding";
import { Anchor, Loader } from "metabase/ui";

export const PublishQuestionEmptyState = () => {
  const { isFetching } = useSdkIframeEmbedSetupContext();
  const toggleEmbedding = useToggleResourceEmbedding();

  if (!toggleEmbedding) {
    return null;
  }

  const { handleSave } = toggleEmbedding;

  return (
    <EmptyState
      illustrationElement={<img src={EmptyDashboardBot} />}
      message={
        isFetching ? (
          <Loader size="xs" />
        ) : (
          jt`The get the embedding code, ${(
            <Anchor
              key="publish-guest-embed-question"
              target="_blank"
              size="md"
              lh="lg"
              onClick={handleSave}
            >
              {t`publish this question`}
            </Anchor>
          )}.`
        )
      }
    />
  );
};
