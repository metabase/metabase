import { createContext, useContext } from "react";

import type { ColorName } from "metabase/ui/colors/types";

interface StoryBoardContextValue {
  inverseText: boolean;
}

export const StoryBoardContext = createContext<StoryBoardContextValue>({
  inverseText: false,
});

type StoryTextTone = "primary" | "secondary";

export const useStoryTextColor = (tone: StoryTextTone): ColorName => {
  const { inverseText } = useContext(StoryBoardContext);
  return inverseText ? `text-${tone}-inverse` : `text-${tone}`;
};
