import { Group } from "metabase/ui";

import { ButtonsContainer, EditIcon, Root, Title } from "./EditBar.styled";

type Props = {
  title: string;
  center?: JSX.Element;
  buttons: JSX.Element[];
  admin?: boolean;
  className?: string;
  "data-testid"?: string;
};

function EditBar({
  title,
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
      <Group gap="sm" align="center" noWrap>
        <EditIcon name="pencil" size={12} />
        <Title>{title}</Title>
      </Group>
      {center && <div>{center}</div>}
      <ButtonsContainer>{buttons}</ButtonsContainer>
    </Root>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditBar;
