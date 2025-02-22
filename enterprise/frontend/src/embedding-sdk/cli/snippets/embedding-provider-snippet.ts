import { getSdkPackageName } from "../utils/snippets-helpers";

interface Options {
  instanceUrl: string;
  apiKey: string;
  userSwitcherEnabled: boolean;
  isNextJs: boolean;
}

export const getEmbeddingProviderSnippet = (options: Options) => {
  const { instanceUrl, apiKey, userSwitcherEnabled, isNextJs } = options;

  const sdkPackageName = getSdkPackageName({ isNextJs });

  let imports = "";
  let apiKeyOrAuthUriConfig = "";

  // Fallback to API keys when user switching is not enabled.
  if (userSwitcherEnabled) {
    apiKeyOrAuthUriConfig += `authProviderUri: \`\${BASE_SSO_API}/sso/metabase\`,`;
    imports = `import { AnalyticsContext, BASE_SSO_API } from './analytics-provider'`;
  } else {
    apiKeyOrAuthUriConfig += `apiKey: '${apiKey}'`;
    imports = `import { AnalyticsContext } from './analytics-provider'`;
  }

  return `
import {useContext, useMemo} from 'react'
import {MetabaseProvider} from '${sdkPackageName}'

${imports}

/** @type {import('@metabase/embedding-sdk-react').MetabaseAuthConfig} */
const authConfig = {
  metabaseInstanceUrl: \`${instanceUrl}\`,
  ${apiKeyOrAuthUriConfig}
}

// Demo provider that wraps the MetabaseProvider with a custom theme and auth configuration.
// In a real app, the theme would be managed by your application.
export const EmbeddingProvider = ({children}) => {
  const {themeKey} = useContext(AnalyticsContext)
  const theme = useMemo(() => THEMES[themeKey], [themeKey])

  return (
    <MetabaseProvider authConfig={authConfig} theme={theme}>
      {children}
    </MetabaseProvider>
  )
}

/**
 * Sample themes for Metabase components.
 *
 * @type {Record<string, import('@metabase/embedding-sdk-react').MetabaseTheme>}
 */
const THEMES = {
  // Light theme
  light: {
    colors: {
      brand: '#509EE3',
      filter: '#7172AD',
      'text-primary': '#4C5773',
      'text-secondary': '#696E7B',
      'text-tertiary': '#949AAB',
      border: '#EEECEC',
      background: '#F9FBFC',
      'background-hover': '#F9FBFC',
      positive: '#84BB4C',
      negative: '#ED6E6E'
    }
  },

  // Dark theme
  dark: {
    colors: {
      brand: '#509EE3',
      filter: '#7172AD',
      'text-primary': '#FFFFFF',
      'text-secondary': '#FFFFFF',
      'text-tertiary': '#FFFFFF',
      border: '#5A5F6B',
      background: '#2D353A',
      'background-hover': '#2D353A',
      positive: '#84BB4C',
      negative: '#ED6E6E'
    }
  }
}
`;
};
