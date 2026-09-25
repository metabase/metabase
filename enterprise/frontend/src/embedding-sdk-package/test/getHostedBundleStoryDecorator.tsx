// eslint-disable-next-line no-restricted-imports
import { MantineProvider } from "@mantine/core";
import type { StoryContext } from "@storybook/react";
import { type ComponentType, useEffect } from "react";

import { deleteConflictingCljsGlobals } from "metabase/embedding-sdk/test/delete-conflicting-cljs-globals";

export const getHostedBundleStoryDecorator = () =>
  function useDecorator(Story: ComponentType, context: StoryContext) {
    useEffect(() => {
      deleteConflictingCljsGlobals();

      return () => {
        window.location.reload();
      };
    }, [context.name]);

    return (
      <MantineProvider>
        <Story />
      </MantineProvider>
    );
  };
