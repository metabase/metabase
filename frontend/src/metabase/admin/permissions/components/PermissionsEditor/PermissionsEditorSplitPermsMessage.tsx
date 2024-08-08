import { t } from "ttag";

import { colors } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateUserSetting } from "metabase/redux/settings";
import { getDocsUrl } from "metabase/selectors/settings";
import { Anchor, Text, Box, Icon, Alert } from "metabase/ui";

export const PermissionsEditorSplitPermsMessage = () => {
  const dispatch = useDispatch();

  const docsUrl = useSelector(state =>
    getDocsUrl(state, { page: "permissions/no-self-service-deprecation" }),
  );

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
      style={{
        marginInlineEnd: "2.5rem",
      }}
    >
      <Alert
        icon={
          <Icon
            name="info_filled"
            size={16}
            color="var(--mb-color-text-dark)"
          />
        }
        variant="light"
        p="1rem"
        styles={{
          root: {
            backgroundColor: "var(--mb-color-brand-lighter)",
          },
          closeButton: {
            color: "var(--mb-color-text-dark)",
          },
        }}
        withCloseButton
        onClose={handleDismiss}
      >
        <Text>
          {t`Your data permissions may look different, but the access hasn’t changed.`}
          <Anchor
            ml="0.5rem"
            fw="bold"
            target="_blank"
            href={docsUrl}
            style={{ color: colors.accent7 }}
          >{t`Learn more`}</Anchor>
        </Text>
      </Alert>
    </Box>
  );
};
