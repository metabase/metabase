import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Box, Group, Modal } from "metabase/ui";

import S from "../AddDataModal.module.css";

interface HeaderProps {
  activeTab: string | null;
  isAdmin: boolean;
  onAddDataModalClose: () => void;
}
export const PanelsHeader = ({
  activeTab,
  isAdmin,
  onAddDataModalClose,
}: HeaderProps) => {
  const showDatabasesLink = activeTab === "db" && isAdmin;

  return (
    <Box component="header" className={S.header}>
      <Group ml="auto" align="center" justify="flex-end" gap="lg">
        {showDatabasesLink && (
          <Box
            component={Link}
            to={Urls.viewDatabases()}
            fw={700}
            c="brand"
          >{t`Manage databases`}</Box>
        )}
        <Modal.CloseButton size="1rem" onClick={onAddDataModalClose} />
      </Group>
    </Box>
  );
};
