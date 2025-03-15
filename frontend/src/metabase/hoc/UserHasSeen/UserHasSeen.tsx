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

  /*
    This is a really odd way to name things, but essentially
    if the user hasn't seen the key before, then the value from
    the API will be false. So we compute isNew to be the opposite of
    that. This is also useful when we want to determine
    the value based on something other than the API response
  */
  const isNew = overrideFn(hasSeen);

  useEffect(() => {
    const hasContext = upsertBadge && removeBadge;
    // In this case, we only want to register the value with the context
    // if we are actually going to pass back that the value isNew
    const hasLoadedValueAndIsTrue = !isLoading && isNew;
    if (hasContext) {
      if (hasLoadedValueAndIsTrue) {
        upsertBadge({ key: hasSeenKey, value: hasSeen });
        return () => removeBadge({ key: hasSeenKey });
      }
    }
  }, [isNew, hasSeenKey, hasSeen, isLoading, upsertBadge, removeBadge]);

  return children({ isNew, ack });
};
