import React from "react";

export interface HomeCardProps {
  title: string;
  icon?: string;
  href?: string;
}

const HomeCard = ({ title }: HomeCardProps): JSX.Element => {
  return <div />;
};

export default HomeCard;
