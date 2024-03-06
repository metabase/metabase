import { Button, Text } from "metabase/ui";

export const NotLoggedInBlock = () => {
  return (
    <div>
      <Text>You should be logged in to see this content.</Text>
      <Button>Log in</Button>
    </div>
  );
};
