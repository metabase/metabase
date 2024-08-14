import type { IconName } from "metabase/ui";

import { HomeCard } from "../HomeCard";

import { CardIcon, CardTitle } from "./HomeModelCard.styled";

interface HomeModelCardProps {
  title: string;
  icon: HomeModelIconProps;
  url: string;
}

export interface HomeModelIconProps {
  name: IconName;
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
