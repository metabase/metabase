import type { App } from "@modelcontextprotocol/ext-apps/react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { UnstyledButton } from "metabase/ui";
import * as Urls from "metabase/urls";

interface McpExploreButtonProps {
  app: App | null;
  instanceUrl: string;
}

export function McpExploreButton({ app, instanceUrl }: McpExploreButtonProps) {
  const { question } = useSdkQuestionContext();
  const applicationName = useSelector(getApplicationName);

  async function handleExploreClicked() {
    if (!instanceUrl || !question || !app) {
      return;
    }

    const url = instanceUrl + Urls.serializedQuestion(question.card());

    await app.openLink({ url });
  }

  return (
    <UnstyledButton
      onClick={handleExploreClicked}
      disabled={!app || !question || !instanceUrl}
      c="text-primary"
      fz={12}
      fw={400}
      lh="normal"
      p={0}
    >
      {t`Explore in ${applicationName}`}
    </UnstyledButton>
  );
}
