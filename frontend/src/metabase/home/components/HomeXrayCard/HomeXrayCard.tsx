import { HomeCard } from "../HomeCard";

import {
  CardIcon,
  CardTitle,
  CardTitlePrimary,
  CardTitleSecondary,
} from "./HomeXrayCard.styled";
import { trackHomeXRayClicked } from "./analytics";

interface HomeXrayCardProps {
  title: string;
  url: string;
  message: string;
}

export const HomeXrayCard = ({
  title,
  url,
  message,
}: HomeXrayCardProps): JSX.Element => {
  return (
    <HomeCard url={url} onClick={trackHomeXRayClicked}>
      <CardIcon name="bolt_filled" />
      <CardTitle>
        <CardTitleSecondary>{message}</CardTitleSecondary>{" "}
        <CardTitlePrimary>{title}</CardTitlePrimary>
      </CardTitle>
    </HomeCard>
  );
};
