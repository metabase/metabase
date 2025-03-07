import { IndicatorMenuContext } from "metabase/core/components/IndicatorMenu/IndicatorMenuContext";
import { useUserAcknowledgement } from "metabase/hooks/use-user-acknowledgement";
import { useContext, useEffect } from "react";
import { useKeyPressEvent } from "react-use";

interface UserHasSeenProps {
  hasSeenKey: string;
  children: ({ show, ack }: { show: boolean; ack: () => void }) => JSX.Element;
  overrideFn?: (hasSeen: boolean) => boolean;
}

export const UserHasSeen = ({
  hasSeenKey,
  children,
  overrideFn = hasSeen => !hasSeen,
}: UserHasSeenProps) => {
  const indicatorContext = useContext(IndicatorMenuContext);

  const [hasSeen, { ack, isLoading, unack }] = useUserAcknowledgement(
    hasSeenKey,
    true,
  );

  console.log(hasSeenKey);

  useKeyPressEvent("q", unack);

  const show = overrideFn(hasSeen);

  useEffect(() => {
    if (indicatorContext) {
      if (!isLoading && show) {
        indicatorContext.upsertBadge({ key: hasSeenKey, value: hasSeen });
        return () => indicatorContext.removeBadge({ key: hasSeenKey });
      }
    }
  }, [show]);

  return children({ show, ack });
};
