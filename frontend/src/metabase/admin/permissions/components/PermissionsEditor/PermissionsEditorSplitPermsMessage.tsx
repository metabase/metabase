import { t } from "ttag";

import { colors } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { updateUserSetting } from "metabase/redux/settings";
import { Anchor, Text, Box, Flex, Icon, Button } from "metabase/ui";

export const PermissionsEditorSplitPermsMessage = () => {
  const dispatch = useDispatch();

  const handleDismiss = () => {
    dispatch(
      updateUserSetting({
        key: "show-updated-permission-banner",
        value: false,
      }),
    );
  };

  return (
    <Box
      mt="0.75rem"
      mb="1.75rem"
      p="2rem"
      style={{
        marginInlineEnd: "2.5rem",
        border: `1px solid var(--mb-color-border)`,
        borderRadius: "0.5rem",
      }}
    >
      <Flex justify="space-between" align="start">
        <Text fw="bold" size="lg" mb="1rem">
          {t`Permissions have been improved, but user access hasn’t changed.`}
        </Text>

        <Button
          onClick={handleDismiss}
          leftIcon={<Icon name="close" />}
          variant="subtle"
          color="text-dark"
          compact
        ></Button>
      </Flex>

      <Box>
        <Text mb="0.25rem">
          {t`In Metabase 50, we updated our data permissions system to make it more expressive and easier. Your permissions will automatically update to the new system. With some small differences, your groups will have the same level of access as before.`}
        </Text>
        <Anchor
          fw="bold"
          target="_blank"
          href="https://www.metabase.com/docs/latest/permissions/no-self-service-deprecation"
          style={{ color: colors.accent7 }}
        >{t`Learn more`}</Anchor>
      </Box>
    </Box>
  );
};
