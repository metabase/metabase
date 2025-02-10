import path from "path";

/**
 * Custom app snippets for the Pages Router.
 */
export function getNextJsCustomAppSnippet({
  generatedDir,
}: {
  generatedDir: string;
}) {
  const getImport = (pathName: string) =>
    path.normalize(`../${generatedDir}/${pathName}`);

  const snippet = `
  import type { AppProps } from 'next/app'

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
export function getNextJsRootLayoutSnippet({
  generatedDir,
}: {
  generatedDir: string;
}) {
  const getImport = (pathName: string) =>
    path.normalize(`../${generatedDir}/${pathName}`);

  const snippet = `
  import type { AppProps } from 'next/app'

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
