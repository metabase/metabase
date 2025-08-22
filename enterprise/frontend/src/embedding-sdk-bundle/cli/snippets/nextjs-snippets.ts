/**
 * Next.js page for /app/analytics-demo/page.tsx or /pages/analytics-demo.tsx
 */
export const getNextJsAnalyticsPageSnippet = ({
  resolveImport,
}: {
  resolveImport: (pathName: string) => string;
}) =>
  `import { AnalyticsDashboard } from '${resolveImport("analytics-dashboard")}'

export default function AnalyticsPage() {
  return (
    <AnalyticsDashboard />
  );
}
`.trim();

/**
 * Custom app snippets for the Pages Router.
 */
function getNextJsCustomAppSnippet({
  resolveImport,
}: {
  resolveImport: (pathName: string) => string;
}) {
  const snippet = `
import { AnalyticsProvider } from "${resolveImport("analytics-provider")}"
import { EmbeddingProvider } from "${resolveImport("embedding-provider")}"

import "${resolveImport("analytics.css")}"

export default function CustomApp({ Component, pageProps }) {
  return (
    <AnalyticsProvider>
      <EmbeddingProvider>
        <Component {...pageProps} />
      </EmbeddingProvider>
    </AnalyticsProvider>
  )
}
`;

  return snippet.trim();
}

/**
 * Generates a default Next.js root layout.
 * This file should be placed as `app/layout.tsx`.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/layout#root-layouts
 */
function getNextJsRootLayoutSnippet({
  resolveImport,
}: {
  resolveImport: (path: string) => string;
}) {
  const snippet = `
import { AnalyticsProvider } from "${resolveImport("analytics-provider")}"
import { EmbeddingProvider } from "${resolveImport("embedding-provider")}"

import "${resolveImport("analytics.css")}"

export default function RootLayout({children}) {
  return (
    <html>
      <body>
        <AnalyticsProvider>
          <EmbeddingProvider>
            {children}
          </EmbeddingProvider>
        </AnalyticsProvider>
      </body>
    </html>
  )
}
`;

  return snippet.trim();
}

/**
 * Generates a root layout (for the app router) or a custom app (for the pages router),
 * which wraps the entire app with the appropriate providers.
 */
export function getNextJsPagesWrapperOrAppWrapperSnippet({
  router,
  resolveImport,
}: {
  router: "app" | "pages" | null;
  resolveImport: (path: string) => string;
}): string {
  if (router === "app") {
    return getNextJsRootLayoutSnippet({ resolveImport });
  }

  if (router === "pages") {
    return getNextJsCustomAppSnippet({ resolveImport });
  }

  return "";
}
