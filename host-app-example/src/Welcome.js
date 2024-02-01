import {useSetting} from "metabase-embedding-sdk"

export const Welcome = () => {
  const appName = useSetting("site-name")

  return (
      <span>Welcome to {appName}!</span>
  );
}