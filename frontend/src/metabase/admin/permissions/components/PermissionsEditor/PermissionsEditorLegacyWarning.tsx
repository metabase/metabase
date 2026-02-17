import { t } from "ttag";

import { useToggle } from "metabase/common/hooks/use-toggle";
import { Alert, Anchor, Box, Icon, Text } from "metabase/ui";

export const PermissionsEditorLegacyNoSelfServiceWarning = () => {
  const [isExpanded, { toggle }] = useToggle(false);

  return (
    <Box mt="md" mb="sm" style={{ marginInlineEnd: "2.5rem" }}>
      <Alert icon={<Icon name="warning" size={16} />} color="info">
        <Text fw="bold">
          {t`The “No self-service” access level for View data is going away.`}
          {!isExpanded && (
            <>
              {" "}
              <Text
                fw="bold"
                c="brand"
                onClick={toggle}
                component="span"
                style={{ cursor: "pointer" }}
              >{t`Read more`}</Text>
            </>
          )}
        </Text>

        {isExpanded && (
          <Text>
            {t`In a future release, if a group’s View data access for a database (or any of its schemas or tables) is still set to “No self-service (deprecated)”, Metabase will automatically change that group’s View data access for the entire database to “Blocked”. We’ll be defaulting to “Blocked”, the least permissive View data access, to prevent any unintended access to data.`}{" "}
            <Anchor
              fw="bold"
              target="_blank"
              href="https://www.metabase.com/docs/v0.50/permissions/no-self-service-deprecation"
            >{t`Need help? See our docs.`}</Anchor>
          </Text>
        )}
      </Alert>
    </Box>
  );
};
