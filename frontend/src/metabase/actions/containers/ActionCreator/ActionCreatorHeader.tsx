import {
  ActionButtons,
  Container,
  LeftHeader,
  Name,
} from "./ActionCreatorHeader.styled";

type Props = {
  name: string;
  actionButtons: React.ReactElement[];
};

const ActionCreatorHeader = ({ name, actionButtons }: Props) => {
  return (
    <Container>
      <LeftHeader>
        <Name>{name}</Name>
      </LeftHeader>
      {actionButtons.length > 0 && (
        <ActionButtons>{actionButtons}</ActionButtons>
      )}
    </Container>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionCreatorHeader;
