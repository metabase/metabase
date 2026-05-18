import type { App } from "@modelcontextprotocol/ext-apps/react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { Button } from "metabase/ui";
import * as Urls from "metabase/urls";

interface McpExploreButtonProps {
  app: App | null;
  instanceUrl: string;
}

export function McpExploreButton({ app, instanceUrl }: McpExploreButtonProps) {
  const { question } = useSdkQuestionContext();

  async function handleExploreClicked() {
    if (!instanceUrl || !question || !app) {
      return;
    }

    const url = instanceUrl + Urls.serializedQuestion(question.card());

    await app.openLink({ url });
  }

  return (
    <Button
      variant="subtle"
      size="xs"
      h={32}
      px="sm"
      bg="transparent"
      onClick={handleExploreClicked}
      disabled={!app || !question || !instanceUrl}
    >
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Figma copy intentionally uses the product name. */}
      {t`Explore in Metabase`}
    </Button>
  );
}
