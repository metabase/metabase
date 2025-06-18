import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Box, Group, Modal } from "metabase/ui";

import S from "../AddDataModal.module.css";

interface HeaderProps {
  showDatabasesLink: boolean;
  showUploadsLink: boolean;
  onAddDataModalClose: () => void;
}
export const PanelsHeader = ({
  showDatabasesLink,
  showUploadsLink,
  onAddDataModalClose,
}: HeaderProps) => {
  return (
    <Box component="header" className={S.header}>
      <Group ml="auto" align="center" justify="flex-end" gap="lg">
        {showDatabasesLink && (
          <Box
            component={Link}
            to={Urls.viewDatabases()}
            fw="bold"
            c="brand"
          >{t`Manage databases`}</Box>
        )}
        {showUploadsLink && (
          <Box
            component={Link}
            to={Urls.uploadsSettings()}
            fw="bold"
            c="brand"
          >{t`Manage uploads`}</Box>
        )}
        <Modal.CloseButton size="1rem" onClick={onAddDataModalClose} />
      </Group>
    </Box>
  );
};
