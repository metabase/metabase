import { PublicNotFound } from "metabase/public/components/PublicNotFound";
import PublicAction from "metabase/public/containers/PublicAction";
import PublicApp from "metabase/public/containers/PublicApp";
import { PublicOrEmbeddedDashboardPage } from "metabase/public/containers/PublicOrEmbeddedDashboard";
import { PublicOrEmbeddedQuestion } from "metabase/public/containers/PublicOrEmbeddedQuestion";
import type { RouteObject } from "metabase/router";

/**
 * The public document page, in its own chunk. It renders the document with
 * tiptap, which the public question and dashboard pages have no use for.
 */
const importPublicDocument = () =>
  import(
    /* webpackChunkName: "public-document" */ "metabase/public/containers/PublicDocument"
  );

const publicDocument = () =>
  importPublicDocument().then(({ PublicDocument }) => ({
    Component: PublicDocument,
  }));

/**
 * A public document is opened by link, so there is no hover to prefetch on. The
 * path is known before the router mounts, so the fetch starts here instead: it
 * then runs alongside the rest of startup rather than after it.
 *
 * Matched loosely because the app can be served under a path prefix. A path that
 * only looks like a document link costs one chunk that is never rendered.
 */
if (window.location.pathname.includes("/public/document/")) {
  importPublicDocument().catch(() => undefined);
}

export const getRoutes = (): RouteObject[] => [
  {
    children: [
      {
        path: "public",
        element: <PublicApp />,
        children: [
          { path: "action/:uuid", element: <PublicAction /> },
          { path: "question/:uuid", element: <PublicOrEmbeddedQuestion /> },
          {
            path: "dashboard/:uuid/:tabSlug?",
            element: <PublicOrEmbeddedDashboardPage />,
          },
          { path: "document/:uuid", lazy: publicDocument },
          { path: "*", element: <PublicNotFound /> },
        ],
      },
      { path: "*", element: <PublicNotFound /> },
    ],
  },
];
