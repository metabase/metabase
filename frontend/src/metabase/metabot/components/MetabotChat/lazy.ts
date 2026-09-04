import { lazy } from "react";

// The chat panel reaches the prompt editor, and through it the whole tiptap and
// prosemirror stack. `Metabot` is mounted for the whole session, so a direct
// import ships that stack on first paint. Loading the panel lazily moves it into
// its own async chunk instead.
const importMetabotChat = () => import("./MetabotChat");

// Start downloading the chunk before the user asks for the sidebar, so the
// sidebar still opens at once. rspack de-duplicates the request, so this shares
// the same chunk as the lazy component below. A failed prefetch is forgotten:
// rspack drops the chunk from its registry, so the render asks again and can
// show the error where the user is looking.
export const prefetchMetabotChat = () => {
  importMetabotChat().catch(() => undefined);
};

/**
 * A new lazy component on every call.
 *
 * `React.lazy` remembers a rejected import and re-throws it on every later
 * render, so a component that failed to fetch can never recover. Retrying needs
 * a component that has not failed yet.
 */
export const createLazyMetabotChat = () =>
  lazy(() =>
    importMetabotChat().then(({ MetabotChat }) => ({
      default: MetabotChat,
    })),
  );
