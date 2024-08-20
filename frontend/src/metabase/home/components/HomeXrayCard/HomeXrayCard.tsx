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
}

export const HomeXrayCard = ({
  title,
  url,
  message,
}: HomeXrayCardProps): JSX.Element => {
  return (
    <CardContainer as={HomeCard}>
      <CardIcon name="bolt_filled" />
      <CardTitle>
        <CardTitlePrimary>{title}</CardTitlePrimary>
        <CardTitleSecondary>{message}</CardTitleSecondary>
      </CardTitle>
    </CardContainer>
  );
};
