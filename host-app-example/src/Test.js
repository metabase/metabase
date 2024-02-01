import {useCurrentUser, useSetting} from "metabase-embedding-sdk"

export const Test = () => {
  const x = useCurrentUser()

  const y = useSetting("application-name")

  console.log(y)

  return (
    <div>
      <p>Hi, {x?.first_name}!</p>
    </div>
  );
}