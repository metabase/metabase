import React from "react";
import { HomeCard } from "../HomeCard";
import { CardIcon, CardTitle } from "./HomeModelCard.styled";

interface HomeModelCardProps {
  title: string;
  icon: HomeModelIconProps;
  url: string;
}

export interface HomeModelIconProps {
  name: string;
}

export const HomeModelCard = ({
  title,
  icon,
  url,
}: HomeModelCardProps): JSX.Element => {
  return (
    <HomeCard url={url}>
      <CardIcon {...icon} />
      <CardTitle>{title}</CardTitle>
    </HomeCard>
  );
};
