import { t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useToggle } from "metabase/hooks/use-toggle";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Icon, Modal, Box, Button, Text } from "metabase/ui";

interface MigrationStartProps {
  startNewMigration: () => void;
  isStarting: boolean;
}

export const MigrationStart = ({
  startNewMigration,
  isStarting,
}: MigrationStartProps) => {
  const [isModalOpen, { turnOn: openModal, turnOff: closeModal }] =
    useToggle(false);

  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );
  const isProSelfHosted = plan === "pro-self-hosted";

  return (
    <>
      <Box mt="1rem">
        <Text size="md">
          {isProSelfHosted
            ? t`Migrate this instance to Metabase Cloud at no extra cost and get high availability, automatic upgrades, backups, and enterprise grade compliance.`
            : t`Migrate this instance to Metabase Cloud with a free 14-day trial and get high availability, automatic upgrades, backups, and official support.`}{" "}
          <ExternalLink href="https://www.metabase.com/cloud/">{t`Learn More.`}</ExternalLink>
        </Text>

        <Button
          mt="2rem"
          variant="filled"
          onClick={openModal}
        >{t`Get started`}</Button>
      </Box>

      <Modal.Root
        opened={isModalOpen}
        onClose={closeModal}
        size={"36rem"}
        data-testid="new-cloud-migration-confirmation"
      >
        <Modal.Overlay />
        <Modal.Content pt="1rem" pb="4rem">
          <Modal.Header py="0" px="1rem">
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body mt="md" py="0" px="6rem" ta="center">
            {/* TODO: get filled cloud icon from design */}
            <Icon name="cloud_filled" size="3rem" color={color("brand")} />
            <Modal.Title mt="1.5rem">{t`Get started with Metabase Cloud`}</Modal.Title>

            <Text mt="1.5rem">
              {t`Just a heads up: your Metabase will be read-only for up to 30
              minutes while we prep it for migration.`}{" "}
              <ExternalLink href="https://www.metabase.com/cloud/">{t`Learn More.`}</ExternalLink>
            </Text>

            <Button
              variant="filled"
              disabled={isStarting}
              onClick={startNewMigration}
              mt="2rem"
            >{t`Migrate now`}</Button>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
};
