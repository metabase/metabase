import { t } from "ttag";

import { UserTypeToggle } from "../UserTypeToggle";

import { ChangeTypeButton, UserTypeCellRoot } from "./UserTypeCell.styled";

interface UserTypeCellProps {
  isAdmin: boolean;
  isManager: boolean;
  onChange: (isManager: boolean) => void;
}
export const UserTypeCell = ({
  isAdmin,
  isManager,
  onChange,
}: UserTypeCellProps) => {
  if (isAdmin) {
    return <UserTypeCellRoot>{t`Admin`}</UserTypeCellRoot>;
  }

  return (
    <UserTypeCellRoot>
      {isManager ? t`Manager` : t`Member`}
      <ChangeTypeButton>
        <UserTypeToggle isManager={isManager} onChange={onChange} />
      </ChangeTypeButton>
    </UserTypeCellRoot>
  );
};
