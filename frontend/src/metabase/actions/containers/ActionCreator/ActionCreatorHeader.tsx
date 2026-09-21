import { t } from "ttag";

import {
  ActionButtons,
  Container,
  EditableText,
  LeftHeader,
} from "./ActionCreatorHeader.styled";

type Props = {
  name: string;
  isEditable: boolean;
  canRename: boolean;
  onChangeName: (name: string) => void;
  actionButtons: React.ReactElement[];
};

const ActionCreatorHeader = ({
  name = t`New Action`,
  isEditable,
  canRename,
  onChangeName,
  actionButtons,
}: Props) => {
  return (
    <Container>
      <LeftHeader>
        <EditableText
          initialValue={name}
          onChange={onChangeName}
          isDisabled={!isEditable || !canRename}
        />
      </LeftHeader>
      {actionButtons.length > 0 && (
        <ActionButtons>{actionButtons}</ActionButtons>
      )}
    </Container>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionCreatorHeader;
