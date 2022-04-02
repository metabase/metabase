import React from "react";
import {
  XrayCard,
  XrayIcon,
  XrayIconContainer,
  XrayTitle,
  XrayTitlePrimary,
  XrayTitleSecondary,
} from "./HomeXrayCard.styled";

export interface HomeXrayCardProps {
  title: string;
  url: string;
  message: string;
}

const HomeXrayCard = ({
  title,
  url,
  message,
}: HomeXrayCardProps): JSX.Element => {
  return (
    <XrayCard url={url}>
      <XrayIconContainer>
        <XrayIcon name="bolt" />
      </XrayIconContainer>
      <XrayTitle>
        <XrayTitleSecondary>{message}</XrayTitleSecondary>{" "}
        <XrayTitlePrimary>{title}</XrayTitlePrimary>
      </XrayTitle>
    </XrayCard>
  );
};

export default HomeXrayCard;
