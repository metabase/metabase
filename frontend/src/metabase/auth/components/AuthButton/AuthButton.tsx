import React from "react";
import {
  CardIcon,
  CardLink,
  CardText,
  TextLink,
  TextRoot,
} from "./AuthButton.styled";

export interface AuthButtonProps {
  text: string;
  link?: string;
  icon?: string;
  card?: boolean;
  onClick?: () => void;
}

const AuthButton = ({
  text,
  link = "",
  icon,
  card,
  onClick,
}: AuthButtonProps): JSX.Element => {
  return card ? (
    <CardLink to={link} onClick={onClick}>
      {icon && <CardIcon name={icon} />}
      <CardText>{text}</CardText>
    </CardLink>
  ) : (
    <TextRoot>
      <TextLink to={link} onClick={onClick}>
        {text}
      </TextLink>
    </TextRoot>
  );
};

export default AuthButton;
