import React, { ReactNode } from "react";
import { CardRoot } from "./HomeCard.styled";

export interface HomeCardProps {
  url?: string;
  children?: ReactNode;
}

const HomeCard = ({ url = "", children }: HomeCardProps): JSX.Element => {
  return <CardRoot to={url}>{children}</CardRoot>;
};

export default HomeCard;
