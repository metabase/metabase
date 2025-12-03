export const ANALYTICS_PROVIDER_SNIPPET_MINIMAL = `
import {createContext, useState} from 'react'

/**
 * @typedef {Object} AnalyticsContextType
 * @property {'light'|'dark'} themeKey - The current theme key.
 * @property {null} [email] - Email of the user.
 * @property {(themeKey: 'light'|'dark') => void} setThemeKey - Function to update the theme.
 */

export const AnalyticsContext = createContext(
  /** @type {AnalyticsContextType} */ ({})
);

// Demo provider that adds the state for the example theme switcher component.
// Delete this once you've played around with the theme switcher, and use your
// own application's theming instead.
export const AnalyticsProvider = ({children}) => {
  const [themeKey, setThemeKey] = useState(/** @type {'light'|'dark'} */ ('light'));

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

/**
 * @typedef {Object} AnalyticsContextType
 * @property {'light'|'dark'} themeKey - The current theme key.
 * @property {(themeKey: 'light'|'dark') => void} setThemeKey - Function to update the theme.
 * @property {string|null} [email] - Email of the user.
 * @property {(user: string) => void} [switchUser] - Function to switch users.
 * @property {string|null} [authError] - Optional auth error message.
 */

export const AnalyticsContext = createContext(/** @type {AnalyticsContextType} */ ({}));

const AUTH_SERVER_DOWN_MESSAGE = \`
  Auth server is down.
  Please start the server with 'npm run start'
\`

// Demo provider that adds the state for the example user and theme switcher component.
// Delete this once you've implemented user authentication and theming in your application.
export const AnalyticsProvider = ({children}) => {
  const [email, setEmail] = useState(/** @type {string|null} */ (null))
  const [authError, setAuthError] = useState(/** @type {string|null} */ (null))
  const [themeKey, setThemeKey] = useState(/** @type {'light'|'dark'} */ ('light'));

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
      const message = error instanceof Error
      ? error.message
      : /** @type {string} */ (error);

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
