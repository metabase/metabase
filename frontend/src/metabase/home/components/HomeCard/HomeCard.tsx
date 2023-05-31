import { ReactNode } from "react";
import { CardRoot } from "./HomeCard.styled";

export interface HomeCardProps {
  className?: string;
  url?: string;
  external?: boolean;
  children?: ReactNode;
}

const HomeCard = ({
  className,
  url = "",
  children,
}: HomeCardProps): JSX.Element => {
  return (
    <CardRoot className={className} to={url}>
      {children}
    </CardRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HomeCard;
