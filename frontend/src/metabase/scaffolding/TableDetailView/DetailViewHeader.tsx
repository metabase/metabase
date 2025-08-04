import type { ReactNode } from "react";
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

        <Tooltip
          disabled={!isEdit}
          label={t`Button is disabled to prevent losing unsaved changes. We'll have something better for production.`}
        >
          <Button
            disabled={isEdit}
            leftSection={<Icon name="gear" />}
            onClick={onEditClick}
          >
            {t`Display settings`}
          </Button>
        </Tooltip>
      </Flex>
    </Nav>
  );
}
