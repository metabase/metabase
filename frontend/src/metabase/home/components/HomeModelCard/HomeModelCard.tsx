import type { IconName } from "metabase/ui";

import { HomeCard } from "../HomeCard";

import { CardIcon, CardTitle } from "./HomeModelCard.styled";
import { RecentItem } from "metabase-types/api";

interface HomeModelCardProps {
  title: string;
  icon: HomeModelIconProps;
  url: string;
  preview?: RecentItem;
}

export interface HomeModelIconProps {
  name: IconName;
}

export const HomeModelCard = ({
  title,
  icon,
  url,
  preview,
}: HomeModelCardProps): JSX.Element => {
  return (
    <HomeCard url={url} preview={preview}>
      <CardIcon {...icon} />
      <CardTitle>{title}</CardTitle>
    </HomeCard>
  );
};
