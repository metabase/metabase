import { useContext } from "react";

import {
  UserHasSeenAllContext,
  UserHasSeenAllProvider,
} from "./UserHasSeenAllContext";

interface UserHasSeenAllProps {
  children: ({
    hasSeenAll,
    handleOpen,
  }: {
    hasSeenAll: boolean;
    handleOpen: () => void;
  }) => JSX.Element;
}

const _UserHasSeenAll = ({ children }: UserHasSeenAllProps) => {
  const ctx = useContext(UserHasSeenAllContext);

  if (!ctx) {
    throw new Error("UserHasSeenAll must be used within context");
  }

  const { hasSeenAll, handleOpen } = ctx;

  console.log({ hasSeenAll });

  return children({ hasSeenAll, handleOpen });
};

export const UserHasSeenAll = ({
  menuKey,
  ...rest
}: UserHasSeenAllProps & { menuKey: string }) => (
  <UserHasSeenAllProvider menuKey={menuKey}>
    <_UserHasSeenAll {...rest} />
  </UserHasSeenAllProvider>
);
