import React from "react";
import {
  Root,
  EditIcon,
  Title,
  Subtitle,
  ButtonsContainer,
} from "./EditBar.styled";

type Props = {
  title: string;
  subtitle?: string;
  center?: JSX.Element;
  buttons: JSX.Element[];
  admin?: boolean;
  className?: string;
};

function EditBar({
  title,
  subtitle,
  center,
  buttons,
  admin = false,
  className,
}: Props) {
  return (
    <Root className={className} admin={admin}>
      <div>
        <EditIcon name="pencil" size={12} />
        <Title>{title}</Title>
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
      </div>
      {center && <div>{center}</div>}
      <ButtonsContainer>{buttons}</ButtonsContainer>
    </Root>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditBar;
