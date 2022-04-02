import React from "react";
import { ModelCard, ModelIcon, ModelTitle } from "./HomeModelCard.styled";

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
    <ModelCard url={url}>
      <ModelIcon {...icon} />
      <ModelTitle>{title}</ModelTitle>
    </ModelCard>
  );
};

export default HomeModelCard;
