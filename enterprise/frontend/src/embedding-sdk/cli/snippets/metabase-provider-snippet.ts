import { SDK_PACKAGE_NAME } from "embedding-sdk/cli/constants/config";

export const getMetabaseProviderSnippet = (url: string, apiKey: string) => `
import { createContext, useContext, useMemo, useState } from 'react'
import { MetabaseProvider } from '${SDK_PACKAGE_NAME}'

/** @type {import('${SDK_PACKAGE_NAME}').SDKConfig} */
const config = {
  metabaseInstanceUrl: \`${url}\`,
  apiKey: '${apiKey}'
}

// Used for the example theme switcher component
export const SampleThemeContext = createContext({ themeKey: 'light' })

export const MetabaseEmbedProvider = ({ children }) => {
  const { themeKey } = useContext(SampleThemeContext)
  const theme = useMemo(() => THEMES[themeKey], [themeKey])

  return (
    <MetabaseProvider config={config} theme={theme}>
      {children}
    </MetabaseProvider>
  )
}

export const SampleThemeProvider = ({ children }) => {
  const [themeKey, setThemeKey] = useState('light')

  return (
    <SampleThemeContext.Provider value={{themeKey, setThemeKey}}>
      {children}
    </SampleThemeContext.Provider>
  )
}

/**
  * Sample themes for Metabase components.
  *
  * @type {Record<string, import('${SDK_PACKAGE_NAME}').MetabaseTheme>}
  */
const THEMES = {
  // Light theme
  "light": {
    colors: {
      brand: "#509EE3",
      filter: "#7172AD",
      "text-primary": "#4C5773",
      "text-secondary": "#696E7B",
      "text-tertiary": "#949AAB",
      border: "#EEECEC",
      background: "#F9FBFC",
      "background-hover": "#F9FBFC",
      positive: "#84BB4C",
      negative: "#ED6E6E"
    }
  },

  // Dark theme
  "dark": {
    colors: {
      brand: "#509EE3",
      filter: "#7172AD",
      "text-primary": "#FFFFFF",
      "text-secondary": "#FFFFFF",
      "text-tertiary": "#FFFFFF",
      border: "#5A5F6B",
      background: "#2D353A",
      "background-hover": "#2D353A",
      positive: "#84BB4C",
      negative: "#ED6E6E"
    }
  }
}
`;
