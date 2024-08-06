import { SDK_PACKAGE_NAME } from "embedding-sdk/cli/constants/config";

export const getMetabaseProviderSample = (url: string, apiKey: string) => `
import { createContext } from 'react'
import { MetabaseProvider } from '${SDK_PACKAGE_NAME}'

/** @type {import('${SDK_PACKAGE_NAME}').SDKConfig} */
const config = {
  metabaseInstanceUrl: \`${url}\`,
  apiKey: '${apiKey}'
}

const THEMES = {
  "light": {
    colors: {
      brand: "",
      filter: "",
      "text-primary": "",
      "text-secondary": "",
      "text-tertiary": "",
      border: "",
      background: "",
      "background-hover": "",
      positive: "",
      negative: ""
    }
  },
  "dark": {
    colors: {
      brand: "",
      filter: "",
      "text-primary": "",
      "text-secondary": "",
      "text-tertiary": "",
      border: "",
      background: "",
      "background-hover": "",
      positive: "",
      negative: ""
    }
  }
}

// Used for the example theme switcher component
export const SampleThemeContext = createContext({ themeKey: 'light' })

export const SampleThemeProvider = ({ children }) => {
  const [themeKey, setThemeKey] = useState('light')

  return (
    <SampleThemeContext.Provider value={{themeKey, setThemeKey}}>
      {children}
    </SampleThemeContext.Provider>
  )
}

export const MetabaseEmbedProvider = ({ children }) => {
  const { themeKey } = useContext(SampleThemeContext)
  const theme = useMemo(() => THEMES[themeKey], [themeKey])

  return (
    <MetabaseProvider config={config} theme={theme}>
      {children}
    </MetabaseProvider>
  )
}
`;
