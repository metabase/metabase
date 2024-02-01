import {useApplicationName} from "metabase-embedding-sdk"

export const Welcome = () => {
  const appName = useApplicationName()

  return (
      <span>Welcome to {appName}!</span>
  );
}