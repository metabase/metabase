import { useContext, useEffect } from "react";
import { useKeyPressEvent } from "react-use";

import { useUserAcknowledgement } from "metabase/hooks/use-user-acknowledgement";

import { UserHasSeenAllContext } from "./UserHasSeenAllContext";

interface UserHasSeenProps {
  id: string;
  withContext?: boolean;
  children: ({
    hasSeen,
    ack,
  }: {
    hasSeen: boolean;
    ack: () => void;
  }) => JSX.Element;
}

export const UserHasSeen = ({
  id,
  children,
  withContext = true,
}: UserHasSeenProps) => {
  const indicatorContext = useContext(UserHasSeenAllContext);
  const { upsertBadge, removeBadge } = indicatorContext ?? {};

  const [hasSeen, { ack, isLoading, unack }] = useUserAcknowledgement(id, true);

  useKeyPressEvent("q", unack);

  useEffect(() => {
    const hasContext = upsertBadge && removeBadge;
    // In this case, we only want to register the value with the context
    // if we are actually going to pass back that the value isNew
    if (hasContext && withContext) {
      if (!isLoading) {
        upsertBadge({ key: id, value: hasSeen });
        return () => {
          removeBadge({ key: id });
        };
      }
    }
  }, [id, hasSeen, isLoading, upsertBadge, removeBadge, withContext]);

  return children({ hasSeen, ack });
};
