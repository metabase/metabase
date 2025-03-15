import { useContext, useEffect } from "react";

import { useUserAcknowledgement } from "metabase/hooks/use-user-acknowledgement";

import { UserHasSeenAllContext } from "./UserHasSeenAllContext";

interface UserHasSeenProps {
  hasSeenKey: string;
  children: ({
    isNew,
    ack,
  }: {
    isNew: boolean;
    ack: () => void;
  }) => JSX.Element;
  overrideFn?: (hasSeen: boolean) => boolean;
}

export const UserHasSeen = ({
  hasSeenKey,
  children,
  overrideFn = hasSeen => !hasSeen,
}: UserHasSeenProps) => {
  const indicatorContext = useContext(UserHasSeenAllContext);
  const { upsertBadge, removeBadge } = indicatorContext ?? {};

  const [hasSeen, { ack, isLoading }] = useUserAcknowledgement(
    hasSeenKey,
    true,
  );

  const isNew = overrideFn(hasSeen);

  useEffect(() => {
    if (upsertBadge && removeBadge) {
      if (!isLoading && isNew) {
        upsertBadge({ key: hasSeenKey, value: hasSeen });
        return () => removeBadge({ key: hasSeenKey });
      }
    }
  }, [isNew, hasSeenKey, hasSeen, isLoading, upsertBadge, removeBadge]);

  return children({ isNew, ack });
};
