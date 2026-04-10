import { EntityIcon } from "metabase/common/components/EntityIcon";
import type { IconData } from "metabase/utils/icon";

import { HomeCard } from "../HomeCard";

import { CardTitle } from "./HomeModelCard.styled";

interface HomeModelCardProps {
  title: string;
  icon: IconData;
  url: string;
}

export const HomeModelCard = ({
  title,
  icon,
  url,
}: HomeModelCardProps): JSX.Element => {
  return (
    <HomeCard url={url}>
      <EntityIcon
        {...icon}
        color="brand"
        style={{ display: "block", flex: "0 0 auto" }}
      />
      <CardTitle>{title}</CardTitle>
    </HomeCard>
  );
};
