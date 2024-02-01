import { useApplicationName, useCurrentUser } from "metabase-embedding-sdk";

export const Welcome = () => {
  const appName = useApplicationName();
  const user = useCurrentUser();

  return (
    <h2>
      Welcome to {appName}, {user?.first_name || `Unauthorized user`}!
    </h2>
  );
};
