import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Icon, Modal, Tabs, Title } from "metabase/ui";

import S from "./AddDataModal.module.css";

export const AddDataModal = ({
  onClose,
  opened,
}: {
  onClose: () => void;
  opened: boolean;
}) => {
  return (
    <Modal.Root opened={opened} onClose={onClose} size="auto">
      <Modal.Overlay />
      <Modal.Content h="30rem">
        <Tabs
          variant="none"
          defaultValue="db"
          orientation="vertical"
          classNames={{
            list: S.list,
            tab: S.tab,
          }}
          h="100%"
        >
          <Box component="nav" w="14rem" className={CS.borderRight}>
            <Box component="header" className={S.header}>
              <Title order={2} size="lg">{t`Add data`}</Title>
            </Box>
            <Tabs.List px="md" pb="lg">
              <Tabs.Tab value="db" leftSection={<Icon name="database" />}>
                {t`Database`}
              </Tabs.Tab>
              <Tabs.Tab
                value="csv"
                leftSection={<Icon name="table2" />}
                disabled
              >
                {t`CSV`}
              </Tabs.Tab>
              <Tabs.Tab
                value="gsheet"
                leftSection={<Icon name="document" />}
                disabled
              >
                {t`Google Sheets`}
              </Tabs.Tab>
            </Tabs.List>
          </Box>
          <Box component="main" w="30rem">
            <Tabs.Panel value="db">{"Database content"}</Tabs.Panel>
            <Tabs.Panel value="csv">{"CSV content"}</Tabs.Panel>
            <Tabs.Panel value="gsheet">{"Google Sheets content"}</Tabs.Panel>
          </Box>
        </Tabs>
      </Modal.Content>
    </Modal.Root>
  );
};
