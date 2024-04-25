import { Link } from "react-router";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { Box, Button, Flex, Paper, Title } from "metabase/ui";

export const SMTPConnectionCard = () => {
  return (
    <Box data-testid="smtp-connection-card" w="100%" mb="2.5rem" ml="1rem">
      <Paper shadow="sm" withBorder w="34rem" maw="100%" p="1.75rem">
        <Flex justify="space-between" align="center">
          <Flex align="center" gap="sm">
            <Title>{t`SMTP`}</Title>
            <Paper
              fw="bold"
              c={color("brand")}
              bg={color("brand-light")}
              p={"0.25rem 0.375rem"}
              radius="xs"
            >{t`Active`}</Paper>
          </Flex>
          <Button
            component={Link}
            to="/admin/settings/email/smtp"
            variant="filled"
          >{t`Edit Configuration`}</Button>
        </Flex>
      </Paper>
    </Box>
  );
};
