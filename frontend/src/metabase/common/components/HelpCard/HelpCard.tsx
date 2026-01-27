import type * as React from "react";

import {
  CardHeaderLink,
  CardHeaderStatic,
  CardIcon,
  CardMessage,
  CardRootLink,
  CardRootStatic,
  CardTitle,
} from "./HelpCard.styled";

export interface HelpCardProps {
  title: string;
  helpUrl: string;
  className?: string;
  isFullyClickable?: boolean;
  children: React.ReactNode;
}

const HelpCardInner = ({
  title,
  helpUrl,
  isFullyClickable = true,
  className,
  children,
}: HelpCardProps): JSX.Element => {
  const CardRoot = isFullyClickable ? CardRootLink : CardRootStatic;
  const CardHeader = isFullyClickable ? CardHeaderStatic : CardHeaderLink;

  return (
    <CardRoot
      className={className}
      href={isFullyClickable ? helpUrl : undefined}
    >
      <CardHeader href={isFullyClickable ? undefined : helpUrl}>
        <CardIcon name="info" />
        <CardTitle>{title}</CardTitle>
        <CardIcon name="external" />
      </CardHeader>
      <CardMessage>{children}</CardMessage>
    </CardRoot>
  );
};

export const HelpCard = Object.assign(HelpCardInner, {
  Section: CardMessage,
});
