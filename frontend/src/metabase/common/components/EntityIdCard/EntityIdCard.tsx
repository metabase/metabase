import { Fragment, useState } from "react";
import { t } from "ttag";

import {
  COPY_BUTTON_ICON,
  CopyButton,
} from "metabase/common/components/CopyButton";
import { Link } from "metabase/common/components/Link";
import {
  SIDESHEET_HORIZONTAL_PADDING,
  SidesheetCard,
  type SidesheetCardProps,
  SidesheetCardTitle,
} from "metabase/common/components/Sidesheet";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import {
  Box,
  Collapse,
  Flex,
  Group,
  type GroupProps,
  Icon,
  type MantineSize,
  Paper,
  Popover,
  Stack,
  Text,
  type TitleProps,
  UnstyledButton,
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

const EntityIdExplanation = () => {
  const { url: docsLink, showMetabaseLinks } = useDocsUrl(
    "installation-and-operation/serialization",
  );

  return (
    <Text fz="sm" c="inherit">
      {t`When using serialization, replace the sequential ID with this global entity ID to have stable URLs across environments. Also useful when troubleshooting serialization.`}{" "}
      {showMetabaseLinks && (
        <Link
          target="_new"
          to={docsLink}
          style={{ color: "var(--mb-color-core-brand)" }}
        >
          {t`Learn more`}
        </Link>
      )}
    </Text>
  );
};

export const EntityInfoIcon = () => (
  <Popover position="top-start">
    <Popover.Target>
      <Icon tabIndex={0} name="info" className={Styles.InfoIcon} />
    </Popover.Target>
    <Popover.Dropdown>
      <Paper p="lg" maw="13rem">
        <EntityIdExplanation />
      </Paper>
    </Popover.Dropdown>
  </Popover>
);

export const EntityCopyButton = ({
  entityId,
  size,
}: {
  entityId: string;
  size?: MantineSize;
}) => (
  <CopyButton
    className={Styles.CopyButton}
    value={entityId}
    aria-label={t`Copy entity ID ${entityId}`}
    style={{
      height: "1rem",
    }}
    target={
      <Flex component="span" gap="sm" wrap="nowrap" align="center">
        <span className={Styles.CopyIcon}>{COPY_BUTTON_ICON}</span>
        <Text component="span" size={size} lh="1rem">
          {entityId}
        </Text>
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

export type EntityIdFooterItem = {
  label: string;
  entityId: string;
};

/** Collapsed footer for a Sidesheet's `footer` slot that expands upward to
 * explain entity IDs and list every ID the entity has. */
export function EntityIdFooter({ items }: { items: EntityIdFooterItem[] }) {
  const hasSerialization = useHasTokenFeature("serialization");
  const [isOpen, setIsOpen] = useState(false);

  // exposing this is useless without serialization, so, let's not.
  if (!hasSerialization) {
    return null;
  }

  return (
    <Box bg="background_page-secondary" className={Styles.Footer}>
      <UnstyledButton
        w="100%"
        px={SIDESHEET_HORIZONTAL_PADDING}
        py="md"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((isOpen) => !isOpen)}
      >
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" c="text-secondary">{t`Entity ID info`}</Text>
          <Icon
            name={isOpen ? "chevrondown" : "chevronup"}
            size={12}
            c="text-secondary"
          />
        </Group>
      </UnstyledButton>
      <Collapse in={isOpen}>
        <Stack gap="md" px={SIDESHEET_HORIZONTAL_PADDING} pb="lg">
          <Box c="text-secondary">
            <EntityIdExplanation />
          </Box>
          <Box className={Styles.EntityIdGrid}>
            {items.map(({ label, entityId }) => (
              <Fragment key={entityId}>
                <Text size="sm" c="text-secondary">
                  {label}
                </Text>
                <EntityCopyButton entityId={entityId} size="sm" />
              </Fragment>
            ))}
          </Box>
        </Stack>
      </Collapse>
    </Box>
  );
}
