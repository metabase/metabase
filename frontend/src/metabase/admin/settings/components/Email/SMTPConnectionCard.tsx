import { Link } from "react-router";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import { Box, Button, Flex, Paper, Title } from "metabase/ui";
import { useSelector } from "metabase/lib/redux";
import { getIsEmailConfigured } from "metabase/setup/selectors";

<Link to="/admin/settings/email" className="link text-bold">
  Email Settings
</Link>;

export const SMTPConnectionCard = () => {
  const isEmailConfigured = useSelector(getIsEmailConfigured);

  return (
    <Box data-testid="smtp-connection-card" w="100%" mb="2.5rem" ml="1rem">
      <Paper shadow="sm" withBorder w="34rem" maw="100%" p="1.75rem">
        <Flex justify="space-between" align="center">
          <Flex align="center" gap="sm">
            <Title>{t`SMTP`}</Title>
            {isEmailConfigured && (
              <Paper
                fw="bold"
                c={color("brand")}
                bg={color("brand-light")}
                p={"0.25rem 0.375rem"}
                radius="xs"
              >
                {t`Active`}
              </Paper>
            )}
          </Flex>
          <Button
            component={Link}
            to="/admin/settings/email/smtp"
            variant={isEmailConfigured ? "filled" : "default"}
          >
            {isEmailConfigured ? t`Edit Configuration` : t`Set up`}
          </Button>
        </Flex>
      </Paper>
    </Box>
  );
};
