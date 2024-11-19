export const THEME_SWITCHER_SNIPPET = `
import { useContext } from 'react'

import { AnalyticsContext } from './analytics-provider'

export const ThemeSwitcher = () => {
  const { themeKey, setThemeKey } = useContext(AnalyticsContext)

  const ThemeIcon = ICONS[themeKey]

  return (
    <div
      className="theme-switcher"
      onClick={() => setThemeKey(themeKey === 'light' ? 'dark' : 'light')}
    >
      <ThemeIcon />
    </div>
  )
}

const ICONS = {
  light: () => (
    <svg viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="#2D353A"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0m-5 0h1m8-9v1m8 8h1m-9 8v1M5.6 5.6l.7.7m12.1-.7l-.7.7m0 11.4l.7.7m-12.1-.7l-.7.7"
      />
    </svg>
  ),
  dark: () => (
    <svg viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="#FFF"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 3h.393a7.5 7.5 0 0 0 7.92 12.446A9 9 0 1 1 12 2.992z"
      />
    </svg>
  )
}
`;
