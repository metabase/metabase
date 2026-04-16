import { HARDCODED_USERS } from "../constants/hardcoded-users";

export const getUserSwitcherSnippet = () => {
  const users = HARDCODED_USERS.map((user) => ({
    email: user.email,
    firstName: user.firstName,
  }));

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- cli snippets
  return `
import {useContext} from 'react'

import {AnalyticsContext} from './analytics-provider'

const USERS = ${JSON.stringify(users, null, 2)}

// Demo component to switch between fake users.
// In a real app, this would be managed by your auth provider.
// See https://www.metabase.com/docs/latest/embedding/sdk/authentication
export const UserSwitcher = () => {
  const {email, switchUser} = useContext(AnalyticsContext)

  return (
    <select
      value={email || undefined}
      onChange={(e) => {
        if (switchUser) {
          switchUser(e.target.value)
        }

        // temporary workaround: reload the page to sign in as the new user
        window.location.reload()
      }}
      className="dashboard-select"
    >
      {USERS.map((user) => (
        <option key={user.email} value={user.email}>
          User: {user.firstName}
        </option>
      ))}
    </select>
  )
}
`;
};
