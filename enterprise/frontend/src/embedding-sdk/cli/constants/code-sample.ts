import { SDK_PACKAGE_NAME } from "embedding-sdk/cli/constants/config";

export const getCodeSample = (url: string, apiKey: string) => `
import {
  MetabaseProvider,
  InteractiveDashboard,
} from '${SDK_PACKAGE_NAME}'

/** @type {import('${SDK_PACKAGE_NAME}').SDKConfig} */
const config = {
  metabaseInstanceUrl: \`${url}\`,
  apiKey: '${apiKey}'
}

export const Analytics = () => (
  <MetabaseProvider config={config}>
    <InteractiveDashboard dashboardId={1} />
  </MetabaseProvider>
)
`;
