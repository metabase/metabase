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

import S from "./EntityIdFooter.module.css";

export type EntityIdFooterItem = {
  label: string;
  entityId: string;
};

type EntityIdFooterProps = {
  items: readonly EntityIdFooterItem[];
};

export function EntityIdFooter({ items }: EntityIdFooterProps) {
  const hasSerialization = useHasTokenFeature("serialization");
  const [isOpen, setIsOpen] = useState(false);

  if (!hasSerialization) {
    return null;
  }

  return (
    <Box bg="background_page-secondary" className={S.Footer}>
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
            aria-hidden
          />
        </Group>
      </UnstyledButton>
      <Collapse in={isOpen}>
        <Stack gap="md" px={SIDESHEET_HORIZONTAL_PADDING} pb="lg">
          <EntityIdExplanation />
          <Box component="dl" m={0} className={S.EntityIdGrid}>
            {items.map(({ label, entityId }) => (
              <Fragment key={entityId}>
                <Text component="dt" size="sm" c="text-secondary">
                  {label}
                </Text>
                <Box component="dd" m={0}>
                  <EntityIdCopyButton entityId={entityId} />
                </Box>
              </Fragment>
            ))}
          </Box>
        </Stack>
      </Collapse>
    </Box>
  );
}

const EntityIdExplanation = () => {
  const { url: docsLink, showMetabaseLinks } = useDocsUrl(
    "installation-and-operation/serialization",
  );

  return (
    <Text size="sm" c="text-secondary">
      {t`When using serialization, replace the sequential ID with this global entity ID to have stable URLs across environments. Also useful when troubleshooting serialization.`}{" "}
      {showMetabaseLinks && (
        <Link target="_new" to={docsLink} variant="brand">
          {t`Learn more`}
        </Link>
      )}
    </Text>
  );
};

const EntityIdCopyButton = ({ entityId }: { entityId: string }) => (
  <CopyButton
    className={S.CopyButton}
    value={entityId}
    aria-label={t`Copy entity ID ${entityId}`}
    target={
      <Flex component="span" gap="sm" wrap="nowrap" align="center">
        <span className={S.CopyIcon}>{COPY_BUTTON_ICON}</span>
        <Text component="span" size="sm" lh="1rem">
          {entityId}
        </Text>
      </Flex>
    }
  />
);
