import { t } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { useDocsUrl } from "metabase/common/hooks";
import { CopyButton } from "metabase/components/CopyButton";
import Link from "metabase/core/components/Link";
import { Flex, Group, Icon, Paper, Popover, Text } from "metabase/ui";

const EntityIdTitle = () => {
  const { url: docsLink, showMetabaseLinks } = useDocsUrl(
    "installation-and-operation/serialization",
  );

  return (
    <Group spacing="sm">
      {t`Entity ID`}
      <Popover position="top-start">
        <Popover.Target>
          <Icon
            name="info"
            cursor="pointer"
            style={{ position: "relative", top: "-1px" }}
          />
        </Popover.Target>
        <Popover.Dropdown>
          <Paper p="md" maw="13rem">
            <Text size="sm">
              {t`When using serialization, replace the sequential ID with this global entity ID to have stable URLs across environments. Also useful when troubleshooting serialization.`}{" "}
              {showMetabaseLinks && (
                <>
                  <Link
                    target="_new"
                    to={docsLink}
                    style={{ color: "var(--mb-color-brand)" }}
                  >
                    Learn more
                  </Link>
                </>
              )}
            </Text>
          </Paper>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
};

export function EntityIdCard({ entityId }: { entityId: string }) {
  return (
    <SidesheetCard title={<EntityIdTitle />}>
      <Flex gap="sm" align="end">
        <Text>{entityId}</Text>
        <CopyButton value={entityId} />
      </Flex>
    </SidesheetCard>
  );
}
