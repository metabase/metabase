import { useContext, useEffect } from "react";

import { useUserAcknowledgement } from "metabase/common/hooks/use-user-acknowledgement";

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
  }) => React.ReactNode;
}

export const UserHasSeen = ({
  id,
  children,
  withContext = true,
}: UserHasSeenProps) => {
  const indicatorContext = useContext(UserHasSeenAllContext);
  const { upsertBadge, removeBadge } = indicatorContext ?? {};

  const [hasSeen, { ack, isLoading }] = useUserAcknowledgement(id, true);

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
