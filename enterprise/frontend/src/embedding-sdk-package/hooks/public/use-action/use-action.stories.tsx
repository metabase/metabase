import type { StoryFn } from "@storybook/react";
import type { JSXElementConstructor } from "react";

import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { MetabaseProvider } from "embedding-sdk-package/components/public/MetabaseProvider";
import { getHostedBundleStoryDecorator } from "embedding-sdk-package/test/getHostedBundleStoryDecorator";
import { Box, Button, Stack, Text } from "metabase/ui";

import { useAction } from "./use-action";

const config = getStorybookSdkAuthConfigForUser("admin");

const ACTION_ID = 1;

type SetDiscountParameters = {
  id: string;
  discount: number;
};

export default {
  title: "EmbeddingSDK/use-action",
  decorators: [getHostedBundleStoryDecorator()],
};

const HookTemplate: StoryFn<
  JSXElementConstructor<Record<string, never>>
> = () => {
  const { execute, isExecuting, result, error, reset } =
    useAction<SetDiscountParameters>(ACTION_ID);

  const handleExecute = async () => {
    try {
      await execute({ id: "1", discount: 0.1 });
    } catch {
      // error is captured in hook state for render-time display
    }
  };

  return (
    <MetabaseProvider authConfig={config}>
      <Box p="md">
        <Stack gap="md">
          <Button disabled={isExecuting} onClick={handleExecute}>
            {isExecuting ? "Executing…" : `Execute action ${ACTION_ID}`}
          </Button>

          {result ? (
            <Box>
              <Text fw="bold">Result</Text>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
              <Button mt="xs" variant="subtle" onClick={reset}>
                Reset
              </Button>
            </Box>
          ) : null}

          {error ? (
            <Box>
              <Text c="error" fw="bold">
                Error
              </Text>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {error.data.message ?? "Action failed."}
              </pre>
              <Button mt="xs" variant="subtle" onClick={reset}>
                Dismiss
              </Button>
            </Box>
          ) : null}
        </Stack>
      </Box>
    </MetabaseProvider>
  );
};

export const Default = {
  render: HookTemplate,
};
