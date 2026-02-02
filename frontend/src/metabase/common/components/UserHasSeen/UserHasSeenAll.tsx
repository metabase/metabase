import { useContext } from "react";

import {
  UserHasSeenAllContext,
  UserHasSeenAllProvider,
} from "./UserHasSeenAllContext";

interface UserHasSeenAllProps {
  children: ({
    hasSeenAll,
    handleUpdate,
  }: {
    hasSeenAll: boolean;
    handleUpdate: () => void;
  }) => JSX.Element;
}

const UserHasSeenAllInner = ({ children }: UserHasSeenAllProps) => {
  const ctx = useContext(UserHasSeenAllContext);

  if (!ctx) {
    throw new Error("UserHasSeenAll must be used within context");
  }

  const { hasSeenAll, handleUpdate } = ctx;

  return children({ hasSeenAll, handleUpdate });
};

export const UserHasSeenAll = ({
  id,
  ...rest
}: UserHasSeenAllProps & { id: string }) => (
  <UserHasSeenAllProvider id={id}>
    <UserHasSeenAllInner {...rest} />
  </UserHasSeenAllProvider>
);
