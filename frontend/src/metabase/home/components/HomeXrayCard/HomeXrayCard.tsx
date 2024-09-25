import { HomeCard } from "../HomeCard";

import {
  CardContainer,
  CardIcon,
  CardTitle,
  CardTitlePrimary,
  CardTitleSecondary,
} from "./HomeXrayCard.styled";

interface HomeXrayCardProps {
  title: string;
  url: string;
  message: string;
  onClick?: () => void;
}

export const HomeXrayCard = ({
  title,
  url,
  message,
  onClick
}: HomeXrayCardProps): JSX.Element => {

  return (
    <CardContainer as={HomeCard} onClick={onClick}>
      <CardIcon name="bolt_filled" size={24} />
      <CardTitle>
        <CardTitlePrimary>{message}</CardTitlePrimary>
        {/*<CardTitleSecondary>{message}</CardTitleSecondary>*/}
      </CardTitle>
    </CardContainer>
  );
};
