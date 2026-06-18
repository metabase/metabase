import { t } from "ttag";

import { Box } from "metabase/ui";

import { UserTypeToggle } from "../UserTypeToggle";

import S from "./UserTypeCell.module.css";

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
    return (
      <Box
        component="td"
        className={S.cell}
        tt="capitalize"
        fz="md"
        fw="bold"
        c="text-secondary"
      >
        {t`Admin`}
      </Box>
    );
  }

  return (
    <Box
      component="td"
      className={S.cell}
      tt="capitalize"
      fz="md"
      fw="bold"
      c="text-secondary"
    >
      {isManager ? t`Manager` : t`Member`}
      <Box
        component="button"
        className={S.changeButton}
        c="core-filter"
        px="xs"
        py={0}
      >
        <UserTypeToggle isManager={isManager} onChange={onChange} />
      </Box>
    </Box>
  );
};
