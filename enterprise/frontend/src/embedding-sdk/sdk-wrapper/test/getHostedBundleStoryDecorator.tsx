import type { StoryContext, StoryFn } from "@storybook/react";
import { useEffect } from "react";

import { renameConflictingCljsGlobals } from "./rename-conflicting-cljs-globals";

export const getHostedBundleStoryDecorator = () =>
  function useDecorator(Story: StoryFn, context: StoryContext) {
    useEffect(() => {
      renameConflictingCljsGlobals();

      return () => {
        window.location.reload();
      };
    }, [context.name]);

    return <Story />;
  };
