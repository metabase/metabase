import path from "path";

export function getNextJsAppSnippet({
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

  export default function CustomApp({ Component, pageProps }: AppProps) {
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
