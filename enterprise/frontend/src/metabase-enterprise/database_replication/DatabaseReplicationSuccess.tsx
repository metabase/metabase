import { t } from "ttag";

import { Box, Button, Flex, Loader, Stack, Text, Title } from "metabase/ui";

export const DatabaseReplicationSuccess = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  return (
    <Stack align="center" gap="lg" my="6rem">
      <Box h={96} w={96} pos="relative">
        <img src="app/assets/img/metabot-cloud-96x96.svg" alt="Metabot Cloud" />

        <Flex
          bottom={0}
          pos="absolute"
          right={0}
          align="center"
          direction="row"
          gap={0}
          justify="center"
          wrap="nowrap"
          bg="white"
          fz={0}
          p="xs"
          ta="center"
          style={{
            borderRadius: "100%",
            // boxShadow: `0px 0px 0px 1px rgba(0, 0, 0, 0.05), 0px 1px 6px 0px rgba(0, 0, 0, 0.10)`,
          }}
        >
          <Loader size="sm" ml={1} mt={1} />
        </Flex>
      </Box>

      <Box ta="center">
        <Title c="text-primary" fz="lg">{t`Replication in progress`}</Title>
        <Text c="text-secondary" fz="md" lh={1.43} maw={380}>
          {t`The process runs in the background. Depending on the database size, this can take up to several hours. You will get an email once your data is ready to use.`}
        </Text>
      </Box>

      <Button onClick={onClose} size="md" variant="filled" miw="30%">
        {t`Done`}
      </Button>
    </Stack>
  );
};
