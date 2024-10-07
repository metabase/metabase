import { t } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { useDocsUrl } from "metabase/common/hooks";
import { CopyButton } from "metabase/components/CopyButton";
import Link from "metabase/core/components/Link";
import { Flex, Group, Icon, Paper, Popover, Text } from "metabase/ui";

import Styles from "./EntityIdCard.module.css";

const EntityIdTitle = () => {
  const { url: docsLink, showMetabaseLinks } = useDocsUrl(
    "installation-and-operation/serialization",
  );

  return (
    <Group spacing="sm">
      {t`Entity ID`}
      <Popover position="top-start">
        <Popover.Target>
          <Icon tabIndex={0} name="info" className={Styles.InfoIcon} />
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
    <SidesheetCard title={<EntityIdTitle />} pb="1.25rem">
      <Flex gap="sm">
        <Text lh="1rem">{entityId}</Text>
        <CopyButton className={Styles.CopyButton} value={entityId} />
      </Flex>
    </SidesheetCard>
  );
}
