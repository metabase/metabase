import { type ReactNode, useCallback, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Group, Tooltip } from "metabase/ui/components";
import { Button } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import type { Table } from "metabase-types/api";

import { Nav } from "../components/Nav";

interface DetailViewHeaderProps {
  table: Table;
  rowId?: string | number;
  rowName?: ReactNode;
  isEdit: boolean;
  canOpenPreviousItem: boolean;
  canOpenNextItem: boolean;
  onPreviousItemClick: () => void;
  onNextItemClick: () => void;
  onEditClick: () => void;
  onCloseClick: () => void;
  onSaveClick?: () => void;
}

export function DetailViewHeader({
  table,
  rowId,
  rowName,
  isEdit,
  canOpenPreviousItem,
  canOpenNextItem,
  onPreviousItemClick,
  onNextItemClick,
  onEditClick,
}: DetailViewHeaderProps & { table: any }): JSX.Element {
  const [linkCopied, setLinkCopied] = useState(false);
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  }, []);

  return (
    <Nav rowId={rowId} rowName={rowName} table={table}>
      <Flex align="center" gap="md">
        {(canOpenPreviousItem || canOpenNextItem) && (
          <Group gap="sm">
            <Tooltip disabled={!canOpenPreviousItem} label={t`Previous row`}>
              <Button
                w={32}
                h={32}
                c="text-dark"
                variant="subtle"
                disabled={!canOpenPreviousItem}
                onClick={onPreviousItemClick}
                leftSection={<Icon name="chevronup" />}
                style={{
                  opacity: !canOpenPreviousItem ? 0.5 : 1,
                }}
              />
            </Tooltip>

            <Tooltip disabled={!canOpenNextItem} label={t`Next row`}>
              <Button
                w={32}
                h={32}
                c="text-dark"
                variant="subtle"
                disabled={!canOpenNextItem}
                onClick={onNextItemClick}
                leftSection={<Icon name="chevrondown" />}
                style={{
                  opacity: !canOpenNextItem ? 0.5 : 1,
                }}
              />
            </Tooltip>
          </Group>
        )}

        <Box h={20} w={1} bg="var(--border-color)" />

        <Group gap="sm">
          <Tooltip label={linkCopied ? t`Copied!` : t`Copy link to this row`}>
            <Button
              w={32}
              h={32}
              c="text-dark"
              variant="subtle"
              leftSection={<Icon name="link" />}
              onClick={handleCopyLink}
            />
          </Tooltip>

          <Tooltip
            label={
              isEdit
                ? t`Button is disabled to prevent losing unsaved changes. We'll have something better for production.`
                : t`Settings`
            }
          >
            <Button
              w={32}
              h={32}
              c="text-dark"
              variant="subtle"
              disabled={isEdit}
              leftSection={<Icon name="pencil" />}
              onClick={onEditClick}
              style={{
                opacity: isEdit ? 0.5 : 1,
              }}
            />
          </Tooltip>
        </Group>
      </Flex>
    </Nav>
  );
}
