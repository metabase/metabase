import React from "react";
import HomeCard from "../HomeCard";
import {
  CardIcon,
  CardTitle,
  CardTitlePrimary,
  CardTitleSecondary,
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
    <HomeCard url={url}>
      <CardIcon name="bolt_filled" />
      <CardTitle>
        <CardTitleSecondary>{message}</CardTitleSecondary>{" "}
        <CardTitlePrimary>{title}</CardTitlePrimary>
      </CardTitle>
    </HomeCard>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HomeXrayCard;
