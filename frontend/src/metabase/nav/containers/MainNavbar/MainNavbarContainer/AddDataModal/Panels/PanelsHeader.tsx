import { Link } from "react-router";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { canAccessSettings } from "metabase/selectors/user";
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
  const userCanAccessSettings = useSelector(canAccessSettings);

  const showDatabasesLink = activeTab === "db" && isAdmin;
  const showUploadsLink = activeTab === "csv" && userCanAccessSettings;

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
        {showUploadsLink && (
          <Box
            component={Link}
            to={Urls.uploadsSettings()}
            fw={700}
            c="brand"
          >{t`Manage uploads`}</Box>
        )}
        <Modal.CloseButton size="1rem" onClick={onAddDataModalClose} />
      </Group>
    </Box>
  );
};
