import { lazy } from "react";

// The chat panel reaches the prompt editor, and through it the whole tiptap and
// prosemirror stack. `Metabot` is mounted for the whole session, so a direct
// import ships that stack on first paint. Loading the panel lazily moves it into
// its own async chunk instead.
const importMetabotChat = () => import("./MetabotChat");

// Start downloading the chunk before the user asks for the sidebar, so the
// sidebar still opens at once. rspack de-duplicates the request, so this shares
// the same chunk as the lazy component below.
export const prefetchMetabotChat = () => {
  void importMetabotChat();
};

export const LazyMetabotChat = lazy(() =>
  importMetabotChat().then(({ MetabotChat }) => ({
    default: MetabotChat,
  })),
);
