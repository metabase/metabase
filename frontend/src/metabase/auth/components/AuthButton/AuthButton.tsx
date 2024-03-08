import type { ReactNode } from "react";

import { CardLink, CardText, TextLink } from "./AuthButton.styled";

interface AuthButtonProps {
  link?: string;
  isCard?: boolean;
  children?: ReactNode;
  onClick?: () => void;
}

export const AuthButton = ({
  link = "",
  isCard,
  children,
  onClick,
}: AuthButtonProps): JSX.Element => {
  return isCard ? (
    <CardLink to={link} onClick={onClick}>
      <CardText>{children}</CardText>
    </CardLink>
  ) : (
    <TextLink to={link} onClick={onClick}>
      {children}
    </TextLink>
  );
};
