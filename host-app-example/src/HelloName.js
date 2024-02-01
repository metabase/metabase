import { useCurrentUser } from "metabase-embedding-sdk";

export const HelloName = () => {
  const x = useCurrentUser();

  return <span>Hi, {x?.first_name}!</span>;
};
