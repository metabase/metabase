import type { Ref } from "react";
import { t } from "ttag";

import {
  type HistoryCheckId,
  useHistoryReviewStatus,
} from "metabase/metadata/table-structure";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { Table } from "metabase-types/api";

import {
  DetailPanel,
  DetailPanelHeader,
  FieldDetailsSkeleton,
} from "../DetailPanel";
import {
  CHECK_STATUS_ICON,
  HistoryCheckDetails,
  getCheckTitle,
} from "../TableSection/TableHistory";

type HistoryCheckPanelProps = {
  ref?: Ref<HTMLDivElement>;
  table: Table;
  checkId: HistoryCheckId;
  defaultWidth: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  onPreviewClick: () => void;
};

export function HistoryCheckPanel({
  ref,
  table,
  checkId,
  defaultWidth,
  onWidthChange,
  onClose,
  onPreviewClick,
}: HistoryCheckPanelProps) {
  const status = useHistoryReviewStatus(table);
  const profile =
    status?.profileState.status === "loaded"
      ? status.profileState.profile
      : undefined;
  const check = profile?.checks.find((check) => check.id === checkId);

  return (
    <DetailPanel
      ref={ref}
      defaultWidth={defaultWidth}
      onWidthChange={onWidthChange}
      data-testid="history-check-panel"
    >
      <DetailPanelHeader
        icon={check ? CHECK_STATUS_ICON[check.status].name : "history"}
        label={t`Check`}
        title={getCheckTitle(checkId)}
        isLoading={profile == null}
        actions={
          check != null &&
          check.entityKeys.length > 0 && (
            <HistoryCheckActionsMenu onPreviewClick={onPreviewClick} />
          )
        }
        onClose={onClose}
      />
      {profile && check ? (
        <HistoryCheckDetails
          table={table}
          check={check}
          profile={profile}
          readOnly={!table.can_write}
        />
      ) : (
        <FieldDetailsSkeleton />
      )}
    </DetailPanel>
  );
}

function HistoryCheckActionsMenu({
  onPreviewClick,
}: {
  onPreviewClick: () => void;
}) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon aria-label={t`More actions`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Icon name="eye" />} onClick={onPreviewClick}>
          {t`Preview`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
