import React from "react";
import HomeCard from "../HomeCard";
import { ModelIcon, ModelTitle } from "./HomeModelCard.styled";

export interface HomeModelCardProps {
  title: string;
  icon: HomeModelIconProps;
  url: string;
}

export interface HomeModelIconProps {
  name: string;
}

const HomeModelCard = ({
  title,
  icon,
  url,
}: HomeModelCardProps): JSX.Element => {
  return (
    <HomeCard url={url} primary>
      <ModelIcon {...icon} />
      <ModelTitle>{title}</ModelTitle>
    </HomeCard>
  );
};

export default HomeModelCard;
