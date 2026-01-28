import { c, t } from "ttag";

import EmptyStateImage from "assets/img/empty-states/snippet.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { useToggleResourceEmbedding } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-toggle-resource-embedding";
import { getResourceTypeFromExperience } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-resource-type-from-experience";
import { Anchor, Flex, Loader } from "metabase/ui";

export const PublishQuestionEmptyState = () => {
  const { experience, isFetching } = useSdkIframeEmbedSetupContext();
  const toggleEmbedding = useToggleResourceEmbedding();

  if (!toggleEmbedding) {
    return null;
  }

  const { handleSave } = toggleEmbedding;

  return (
    <Flex direction="column" align="center" justify="center" flex={1}>
      <EmptyState
        illustrationElement={<img src={EmptyStateImage} />}
        message={
          isFetching ? (
            <Loader size="xs" />
          ) : (
            c(
              "{0} is a link that publishes an entity to be embeddable via guest embedding",
            ).jt`To get the embedding code, ${(
              <Anchor
                key="publish-guest-embed-question"
                target="_blank"
                size="md"
                lh="lg"
                onClick={handleSave}
                data-testid="publish-guest-embed-link"
              >
                {t`publish this ${getResourceTypeFromExperience(experience)}`}
              </Anchor>
            )}.`
          )
        }
      />
    </Flex>
  );
};
