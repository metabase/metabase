import { type ReactNode, useCallback, useState } from "react";
import { t } from "ttag";

import { Flex, Tooltip } from "metabase/ui/components";
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
      <Flex align="center" gap="sm">
        {(canOpenPreviousItem || canOpenNextItem) && (
          <>
            <Tooltip disabled={!canOpenPreviousItem} label={t`Previous row`}>
              <Button
                disabled={!canOpenPreviousItem}
                onClick={onPreviousItemClick}
                leftSection={<Icon name="chevronup" />}
              />
            </Tooltip>

            <Tooltip disabled={!canOpenNextItem} label={t`Next row`}>
              <Button
                disabled={!canOpenNextItem}
                onClick={onNextItemClick}
                leftSection={<Icon name="chevrondown" />}
              />
            </Tooltip>
          </>
        )}

        <Tooltip label={linkCopied ? t`Copied!` : t`Copy link to a row`}>
          <Button
            disabled={isEdit}
            leftSection={<Icon name="link" />}
            onClick={handleCopyLink}
          />
        </Tooltip>

        <Tooltip
          disabled={!isEdit}
          label={
            isEdit
              ? t`Button is disabled to prevent losing unsaved changes. We'll have something better for production.`
              : t`Settings`
          }
        >
          <Button
            disabled={isEdit}
            leftSection={<Icon name="pencil" />}
            onClick={onEditClick}
          />
        </Tooltip>
      </Flex>
    </Nav>
  );
}
