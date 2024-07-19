export const getCodeSample = (url: string) => `
import {
  MetabaseProvider,
  InteractiveDashboard,
} from '@metabase/embedding-sdk-react'

/** @type {import('@metabase/embedding-sdk-react').SDKConfig} */
const config = {
  metabaseInstanceUrl: \`${url}\`,
  apiKey: 'INSERT_API_KEY_HERE'
}

export const Analytics = () => (
  <MetabaseProvider config={config}>
    <InteractiveDashboard questionId={1} />
  </MetabaseProvider>
)
`;
