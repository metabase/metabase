import { t } from "ttag";

import { Button, Stack, Text, Title } from "metabase/ui";

export const DatabaseReplicationSuccess = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  return (
    <Stack align="center">
      <img
        src="app/assets/img/metabot-cloud-96x96.svg"
        alt="Metabot Cloud"
        style={{
          width: 96,
          height: 96,
        }}
      />

      <Stack align="center">
        <Title>{t`Replication in progress`}</Title>
        <Text>
          {t`The process runs in the background. Depending on the database size, this can take up to several hours. You will get an email once your data is ready to use.`}
        </Text>
      </Stack>

      <Button
        onClick={onClose}
        size="md"
        variant="filled"
        style={{
          minWidth: 120,
          marginTop: "1rem",
        }}
      >
        {t`Done`}
      </Button>
    </Stack>
  );
};
