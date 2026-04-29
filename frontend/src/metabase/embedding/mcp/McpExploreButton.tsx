import type { App } from "@modelcontextprotocol/ext-apps/react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { Button, Icon } from "metabase/ui";
import { serializedQuestion } from "metabase/utils/urls/questions";

interface McpExploreButtonProps {
  app: App | null;
  instanceUrl: string;
}

export function McpExploreButton({ app, instanceUrl }: McpExploreButtonProps) {
  const { question } = useSdkQuestionContext();

  if (!question || !instanceUrl) {
    return null;
  }

  const handleExplore = async () => {
    const url = instanceUrl + serializedQuestion(question.card());

    if (app) {
      await app.openLink({ url });
    }
  };

  return (
    <Button
      variant="default"
      size="xs"
      h={32}
      px="10px"
      leftSection={<Icon name="click" size={12} />}
      onClick={handleExplore}
    >
      {t`Explore`}
    </Button>
  );
}
