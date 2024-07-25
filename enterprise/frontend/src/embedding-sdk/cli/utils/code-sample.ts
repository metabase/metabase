export const getCodeSample = (url: string, apiKey: string) => `
import {
  MetabaseProvider,
  InteractiveDashboard,
} from '@metabase/embedding-sdk-react'

/** @type {import('@metabase/embedding-sdk-react').SDKConfig} */
const config = {
  metabaseInstanceUrl: \`${url}\`,
  apiKey: '${apiKey}'
}

export const Analytics = () => (
  <MetabaseProvider config={config}>
    <InteractiveDashboard questionId={1} />
  </MetabaseProvider>
)
`;
