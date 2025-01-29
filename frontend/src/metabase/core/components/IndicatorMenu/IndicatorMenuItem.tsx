import type { PolymorphicComponentProps } from "@mantine/utils";
import type React from "react";
import { useContext, useEffect } from "react";

import { useUserAcknowledgement } from "metabase/hooks/use-user-acknowledgement";
import { Badge, Menu, type MenuItemProps } from "metabase/ui";

import { IndicatorMenuContext } from "./IndicatorMenuContext";

type IndicatorMenuItemProps = MenuItemProps & {
  badgeLabel: React.ReactNode;
  userAckKey: string;
  showBadge?: (val: boolean) => boolean;
};

export const IndicatorMenuItem = <C = "button",>(
  props: PolymorphicComponentProps<C, IndicatorMenuItemProps>,
) => {
  const {
    userAckKey,
    badgeLabel = "New",
    children,
    showBadge = (hasSeen: boolean) => !hasSeen,
    ...rest
  } = props;

  //Keep TS Happy
  const typeCastedRest = rest as MenuItemProps;

  const ctx = useContext(IndicatorMenuContext);

  if (!ctx) {
    throw new Error(
      "Indicator Menu Item must be used within an Indicator Menu",
    );
  }

  const { removeBadge, upsertBadge } = ctx;

  const [hasSeen, { ack, isLoading }] = useUserAcknowledgement(
    userAckKey,
    true,
  );

  const isShowingBadge = showBadge(hasSeen);

  useEffect(() => {
    if (!isLoading && isShowingBadge) {
      upsertBadge({ key: userAckKey, value: hasSeen });

      return () => removeBadge({ key: userAckKey });
    }
  }, [
    userAckKey,
    upsertBadge,
    removeBadge,
    hasSeen,
    isShowingBadge,
    isLoading,
  ]);

  const handleClick = () => {
    ack();
  };

  return (
    <Menu.Item
      {...typeCastedRest}
      rightSection={
        isShowingBadge && <Badge variant="light">{badgeLabel}</Badge>
      }
      onClick={handleClick}
    >
      {children}
    </Menu.Item>
  );
};
