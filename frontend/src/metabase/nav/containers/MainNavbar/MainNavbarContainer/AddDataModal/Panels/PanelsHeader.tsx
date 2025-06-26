import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Box, Group, Modal } from "metabase/ui";

import S from "../AddDataModal.module.css";

interface HeaderProps {
  showDatabasesLink: boolean;
  showUploadsLink: boolean;
  showManageImports: boolean;
  onAddDataModalClose: () => void;
}
export const PanelsHeader = ({
  showDatabasesLink,
  showUploadsLink,
  showManageImports,
  onAddDataModalClose,
}: HeaderProps) => {
  const HeaderLink = ({ to, text }: { to: string; text: string }) => (
    <Box component={Link} to={to} fw="bold" c="brand">
      {text}
    </Box>
  );

  return (
    <Box component="header" className={S.header}>
      <Group ml="auto" align="center" justify="flex-end" gap="lg">
        {showDatabasesLink && (
          <HeaderLink to={Urls.viewDatabases()} text={t`Manage databases`} />
        )}
        {showUploadsLink && (
          <HeaderLink to={Urls.uploadsSettings()} text={t`Manage uploads`} />
        )}
        {showManageImports && (
          <HeaderLink to={Urls.uploadsSettings()} text={t`Manage imports`} />
        )}
        <Modal.CloseButton size="1rem" onClick={onAddDataModalClose} />
      </Group>
    </Box>
  );
};
