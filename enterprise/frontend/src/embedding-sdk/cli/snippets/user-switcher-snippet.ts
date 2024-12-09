import { HARDCODED_USERS } from "../constants/hardcoded-users";

export const getUserSwitcherSnippet = () => {
  const users = HARDCODED_USERS.map(user => ({
    email: user.email,
    firstName: user.firstName,
  }));

  return `
import {useContext} from 'react'

import {AnalyticsContext} from './analytics-provider'

const USERS = ${JSON.stringify(users, null, 2)}

export const UserSwitcher = () => {
  const {email, switchUser} = useContext(AnalyticsContext)

  return (
    <select
      value={email}
      onChange={(e) => {
        switchUser(e.target.value)

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
