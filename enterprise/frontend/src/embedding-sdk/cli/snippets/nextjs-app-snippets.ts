import path from "path";

import { checkIfUsingAppOrPagesRouter } from "../utils/nextjs-helpers";

/**
 * Custom app snippets for the Pages Router.
 */
function getNextJsCustomAppSnippet(componentPath: string) {
  const getImport = (pathName: string) =>
    path.normalize(`../${componentPath}/${pathName}`);

  const snippet = `
  import { AnalyticsProvider } from "${getImport("analytics-provider")}"
  import { EmbeddingProvider } from "${getImport("embedding-provider")}"

  import "${getImport("analytics.css")}"

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
function getNextJsRootLayoutSnippet(componentPath: string) {
  const getImport = (pathName: string) =>
    path.normalize(`../${componentPath}/${pathName}`);

  const snippet = `
  import { AnalyticsProvider } from "${getImport("analytics-provider")}"
  import { EmbeddingProvider } from "${getImport("embedding-provider")}"

  import "${getImport("analytics.css")}"

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

export async function getNextJsCustomAppOrRootLayoutSnippet(
  componentPath: string,
): Promise<string> {
  const router = await checkIfUsingAppOrPagesRouter();

  if (router === "app") {
    return getNextJsRootLayoutSnippet(componentPath);
  }

  if (router === "pages") {
    return getNextJsCustomAppSnippet(componentPath);
  }

  return "";
}
