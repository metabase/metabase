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
  "data-testid"?: string;
};

function EditBar({
  title,
  subtitle,
  center,
  buttons,
  admin = false,
  className,
  "data-testid": dataTestId,
}: Props) {
  return (
    <Root
      className={className}
      admin={admin}
      data-testid={dataTestId ?? "edit-bar"}
    >
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
