import { useApplicationName } from "metabase-embedding-sdk";

export const Welcome = () => {
  const appName = useApplicationName();

  return (
    <h2 className="tw-text-lg tw-font-medium">
      Welcome to <span className="tw-font-bold">{appName}</span>
    </h2>
  );
};
