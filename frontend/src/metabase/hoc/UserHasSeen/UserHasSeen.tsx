import { useContext, useEffect } from "react";
import { useKeyPressEvent } from "react-use";

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

  const [hasSeen, { ack, isLoading, unack }] = useUserAcknowledgement(
    hasSeenKey,
    true,
  );

  useKeyPressEvent("q", unack);

  const isNew = overrideFn(hasSeen);

  useEffect(() => {
    if (indicatorContext) {
      if (!isLoading && isNew) {
        indicatorContext.upsertBadge({ key: hasSeenKey, value: hasSeen });
        return () => indicatorContext.removeBadge({ key: hasSeenKey });
      }
    }
  }, [isNew, indicatorContext, hasSeenKey, hasSeen, isLoading]);

  return children({ isNew, ack });
};
