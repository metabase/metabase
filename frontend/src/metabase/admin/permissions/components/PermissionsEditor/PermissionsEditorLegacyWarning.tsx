import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { colors } from "metabase/lib/colors";
import { Icon, Alert, Anchor, Text, Box } from "metabase/ui";

export const PermissionsEditorLegacyNoSelfServiceWarning = () => {
  const [isExpanded, { toggle }] = useToggle(false);

  return (
    <Box mt="md" mb="sm" style={{ marginInlineEnd: "2.5rem" }}>
      <Alert icon={<Icon name="warning" size={16} />} color="accent5">
        <Text fw="bold">
          {t`The “No self-service” access level for View data is going away.`}
          {!isExpanded && (
            <>
              {" "}
              <button onClick={toggle}>
                <Text fw="bold" color={colors.accent7}>{t`Read more`}</Text>
              </button>
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
              style={{ color: colors.accent7 }}
            >{t`Need help? See our docs.`}</Anchor>
          </Text>
        )}
      </Alert>
    </Box>
  );
};
