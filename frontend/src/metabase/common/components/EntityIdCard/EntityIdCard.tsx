import cx from "classnames";
import { t } from "ttag";

import {
  COPY_BUTTON_ICON,
  CopyButton,
} from "metabase/common/components/CopyButton";
import { Link } from "metabase/common/components/Link";
import {
  SidesheetCard,
  type SidesheetCardProps,
  SidesheetCardTitle,
} from "metabase/common/components/Sidesheet";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import {
  Flex,
  Group,
  type GroupProps,
  Icon,
  Paper,
  Popover,
  Text,
  type TitleProps,
} from "metabase/ui";

import Styles from "./EntityIdCard.module.css";

const EntityIdTitle = (props?: TitleProps) => {
  return (
    <SidesheetCardTitle mb={0} {...props}>
      <Group gap="sm">
        {t`Entity ID`}
        <EntityInfoIcon />
      </Group>
    </SidesheetCardTitle>
  );
};

export const EntityInfoIcon = () => {
  const { url: docsLink, showMetabaseLinks } = useDocsUrl(
    "installation-and-operation/serialization",
  );

  return (
    <Popover position="top-start">
      <Popover.Target>
        <Icon tabIndex={0} name="info" className={Styles.InfoIcon} />
      </Popover.Target>
      <Popover.Dropdown>
        <Paper p="md" maw="13rem">
          <Text fz="sm">
            {t`When using serialization, replace the sequential ID with this global entity ID to have stable URLs across environments. Also useful when troubleshooting serialization.`}{" "}
            {showMetabaseLinks && (
              <>
                <Link
                  target="_new"
                  to={docsLink}
                  style={{ color: "var(--mb-color-brand)" }}
                >
                  {t`Learn more`}
                </Link>
              </>
            )}
          </Text>
        </Paper>
      </Popover.Dropdown>
    </Popover>
  );
};

export const EntityCopyButton = ({ entityId }: { entityId: string }) => (
  <CopyButton
    className={cx(Styles.CopyButton, CS.hoverParent, CS.hoverVisibility)}
    value={entityId}
    style={{
      height: "1rem",
    }}
    target={
      <Flex gap="sm" wrap="nowrap" align="center">
        <div className={cx(CS.hoverChild)}>{COPY_BUTTON_ICON}</div>
        <Text lh="1rem">{entityId}</Text>
      </Flex>
    }
  />
);

export const EntityIdDisplay = ({
  entityId,
  ...props
}: { entityId: string } & GroupProps) => {
  return (
    <Group justify="space-between" {...props}>
      <EntityIdTitle />
      <EntityCopyButton entityId={entityId} />
    </Group>
  );
};

export function EntityIdCard({
  entityId,
  ...props
}: { entityId: string } & Omit<SidesheetCardProps, "children">) {
  const hasSerialization = useHasTokenFeature("serialization");

  // exposing this is useless without serialization, so, let's not.
  if (!hasSerialization) {
    return null;
  }

  return (
    <SidesheetCard pb="1.25rem" {...props}>
      <EntityIdDisplay entityId={entityId} />
    </SidesheetCard>
  );
}
