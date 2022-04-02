import React from "react";
import HomeCard from "../HomeCard";
import {
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
    <HomeCard url={url} primary>
      <XrayIconContainer>
        <XrayIcon name="bolt" />
      </XrayIconContainer>
      <XrayTitle>
        <XrayTitleSecondary>{message}</XrayTitleSecondary>{" "}
        <XrayTitlePrimary>{title}</XrayTitlePrimary>
      </XrayTitle>
    </HomeCard>
  );
};

export default HomeXrayCard;
