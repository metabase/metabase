import type { IconName } from "metabase/ui";

import { CardIcon, CardRoot, CardTitle } from "./HomeBlueprintCard.styled";

interface HomeBlueprintCardProps {
  title: string;
  name: IconName;
  url: string;
}

export const HomeBlueprintCard = ({
  title,
  name,
  url,
}: HomeBlueprintCardProps): JSX.Element => {
  return (
    <CardRoot to={url}>
      <CardIcon name={name} size={48} />
      <CardTitle>{title}</CardTitle>
    </CardRoot>
  );
};
