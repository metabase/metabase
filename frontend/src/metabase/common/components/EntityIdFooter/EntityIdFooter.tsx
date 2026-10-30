import { Fragment, useState } from "react";
import { t } from "ttag";

import {
  COPY_BUTTON_ICON,
  CopyButton,
} from "metabase/common/components/CopyButton";
import { Link } from "metabase/common/components/Link";
import { SIDESHEET_HORIZONTAL_PADDING } from "metabase/common/components/Sidesheet";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import {
  Box,
  Collapse,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

import Styles from "./EntityIdFooter.module.css";

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

const EntityCopyButton = ({ entityId }: { entityId: string }) => (
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
        <Text component="span" size="sm" lh="1rem">
          {entityId}
        </Text>
      </Flex>
    }
  />
);

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
                <EntityCopyButton entityId={entityId} />
              </Fragment>
            ))}
          </Box>
        </Stack>
      </Collapse>
    </Box>
  );
}
