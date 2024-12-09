export const ANALYTICS_PROVIDER_SNIPPET_MINIMAL = `
import {createContext, useState} from 'react'

// Used for the example theme switcher component
export const AnalyticsContext = createContext({})

export const AnalyticsProvider = ({children}) => {
  const [themeKey, setThemeKey] = useState('light')

  return (
    <AnalyticsContext.Provider value={{themeKey, setThemeKey}}>
      {children}
    </AnalyticsContext.Provider>
  )
}
`;

export const ANALYTICS_PROVIDER_SNIPPET_WITH_USER_SWITCHER = `
import {createContext, useCallback, useEffect, useState} from 'react'

export const BASE_SSO_API = 'http://localhost:4477'

// Used for the example theme switcher and user switcher components
export const AnalyticsContext = createContext({})

const AUTH_SERVER_DOWN_MESSAGE = \`
  Auth server is down.
  Please start the server with 'npm run start'
\`

export const AnalyticsProvider = ({children}) => {
  const [email, setEmail] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [themeKey, setThemeKey] = useState('light')

  const switchUser = useCallback(async (email) => {
    localStorage.setItem('user-email', email)

    try {
      const res = await fetch(\`\${BASE_SSO_API}/switch-user\`, {
        method: 'POST',
        body: JSON.stringify({email}),
        headers: {'content-type': 'application/json'},
        credentials: 'include'
      })

      if (!res.ok) {
        setAuthError(await res.text())
        return
      }

      setEmail(email)
    } catch (error) {
      const message = error instanceof Error ? error.message : error

      if (message.includes('Failed to fetch')) {
        setAuthError(AUTH_SERVER_DOWN_MESSAGE)
        return
      }

      setAuthError(message)
    }
  }, [])

  const context = {email, switchUser, authError, themeKey, setThemeKey}

  useEffect(() => {
    if (!email) {
      switchUser(localStorage.getItem('user-email') || 'alice@example.com')
    }
  }, [email, switchUser])

  if (authError) {
    return (
      <div className="analytics-auth-container">
        Login failed. Reason: {authError}
      </div>
    )
  }

  if (!email) {
    return <div className="analytics-auth-container">Logging In...</div>
  }

  return (
    <AnalyticsContext.Provider value={context}>
      {children}
    </AnalyticsContext.Provider>
  )
}
`;
