import { IconName } from "metabase/core/components/Icon";

import HomeCard from "../HomeCard";
import { CardIcon, CardTitle } from "./HomeModelCard.styled";

export interface HomeModelCardProps {
  title: string;
  icon: HomeModelIconProps;
  url: string;
}

export interface HomeModelIconProps {
  name: IconName;
}

const HomeModelCard = ({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HomeModelCard;
