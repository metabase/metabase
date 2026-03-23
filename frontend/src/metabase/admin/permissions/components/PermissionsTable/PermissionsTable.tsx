import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { memo, useCallback, useRef, useState } from "react";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { Flex, Text, Tooltip } from "metabase/ui";

import type {
  DataPermissionValue,
  PermissionAction,
  PermissionConfirmationProps,
  PermissionEditorEntity,
  PermissionEditorType,
  PermissionSectionConfig,
} from "../../types";
import { PermissionsSelect } from "../PermissionsSelect";

import {
  ColumnName,
  EntityNameLink,
  HintIcon,
  PermissionTableHeaderCell,
  PermissionsTableCell,
  PermissionsTableRoot,
  PermissionsTableRow,
} from "./PermissionsTable.styled";

export type PermissionsTableProps = Pick<
  PermissionEditorType,
  "entities" | "columns"
> & {
  onSelect?: (entity: PermissionEditorEntity) => void;
  onAction?: (action: PermissionAction, entity: PermissionEditorEntity) => void;
  onChange: (
    entity: PermissionEditorEntity,
    permission: PermissionSectionConfig,
    value: DataPermissionValue,
    toggleState: boolean | null,
  ) => void;
  scrollElement?: HTMLDivElement | null;
  emptyState?: React.ReactNode;
};

const ROW_HEIGHT = 40;
const VIRTUALIZATION_THRESHOLD = 100;

export function PermissionsTable({
  entities,
  columns,
  onSelect,
  onAction,
  onChange,
  scrollElement,
  emptyState = null,
}: PermissionsTableProps) {
  const [confirmations, setConfirmations] = useState<
    PermissionConfirmationProps[]
  >([]);
  const confirmActionRef = useRef<(() => void) | null>(null);

  const handleChange = useCallback(
    (
      value: DataPermissionValue,
      toggleState: boolean | null,
      entity: PermissionEditorEntity,
      permission: PermissionSectionConfig,
    ) => {
      const confirmAction = () =>
        onChange(entity, permission, value, toggleState);

      const confirmations =
        permission.confirmations?.(value).filter((c) => c !== undefined) || [];

      if (confirmations.length > 0) {
        setConfirmations(confirmations);
        confirmActionRef.current = confirmAction;
      } else {
        confirmAction();
      }
    },
    [onChange],
  );

  const handleConfirm = () => {
    setConfirmations((prev) => prev.slice(1));
    if (confirmations.length === 1) {
      confirmActionRef.current?.();
      confirmActionRef.current = null;
    }
  };

  const handleCancelConfirm = () => {
    setConfirmations([]);
    confirmActionRef.current = null;
  };

  // this is weird, but: we *would* virtualize if we have enough entities. But on page load, we may not YET have
  // a non-null `scrollElement`, because the DOM doesn't exist yet.
  const wouldVirtualize = entities.length > VIRTUALIZATION_THRESHOLD;
  const canVirtualize = scrollElement != null && wouldVirtualize;

  const virtualizer = useVirtualizer({
    count: entities.length,
    getScrollElement: () => scrollElement ?? null,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
    enabled: canVirtualize,
  });

  const hasItems = entities.length > 0;

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const tableContent =
    wouldVirtualize && !canVirtualize ? (
      <tbody />
    ) : canVirtualize ? (
      <tbody>
        {virtualItems.length > 0 && (
          <tr>
            <td
              style={{ height: virtualItems[0].start, padding: 0 }}
              colSpan={columns.length}
            />
          </tr>
        )}
        {virtualItems.map((virtualItem) => (
          <EntityRow
            key={entities[virtualItem.index].id}
            entity={entities[virtualItem.index]}
            onChange={handleChange}
            onSelect={onSelect}
            onAction={onAction}
          />
        ))}
        {virtualItems.length > 0 && (
          <tr>
            <td
              style={{
                height: totalSize - virtualItems[virtualItems.length - 1].end,
                padding: 0,
              }}
              colSpan={columns.length}
            />
          </tr>
        )}
      </tbody>
    ) : (
      <tbody>
        {entities.map((entity) => (
          <EntityRow
            key={entity.id}
            entity={entity}
            onChange={handleChange}
            onSelect={onSelect}
            onAction={onAction}
          />
        ))}
      </tbody>
    );

  return (
    <>
      <PermissionsTableRoot data-testid="permission-table">
        <thead>
          <tr>
            {columns.map(({ name, hint }) => {
              return (
                <PermissionTableHeaderCell key={name}>
                  <ColumnName>
                    {name}{" "}
                    {hint && (
                      <Tooltip
                        label={hint}
                        closeDelay={100}
                        classNames={{ tooltip: CS.pointerEventsAuto }}
                      >
                        <HintIcon />
                      </Tooltip>
                    )}
                  </ColumnName>
                </PermissionTableHeaderCell>
              );
            })}
          </tr>
        </thead>
        {tableContent}
      </PermissionsTableRoot>
      {!hasItems && emptyState}
      <ConfirmModal
        opened={confirmations?.length > 0}
        {...confirmations[0]}
        onConfirm={handleConfirm}
        onClose={handleCancelConfirm}
      />
    </>
  );
}

type EntityRowProps = {
  entity: PermissionEditorEntity;
  onChange: (
    value: DataPermissionValue,
    toggleState: boolean | null,
    entity: PermissionEditorEntity,
    permission: PermissionSectionConfig,
  ) => void;
  onSelect?: (entity: PermissionEditorEntity) => void;
  onAction?: (action: PermissionAction, entity: PermissionEditorEntity) => void;
};

const EntityRow = memo(function EntityRow({
  entity,
  onChange,
  onSelect,
  onAction,
}: EntityRowProps) {
  const entityName = (
    <span className={cx(CS.flex, CS.alignCenter)}>
      <Ellipsified>{entity.name}</Ellipsified>
      {typeof entity.hint === "string" && (
        <Tooltip label={entity.hint}>
          <HintIcon />
        </Tooltip>
      )}
    </span>
  );
  return (
    <PermissionsTableRow aria-label={`${entity.name} permissions`}>
      <PermissionsTableCell>
        {entity.canSelect ? (
          // @ts-expect-error - Link expects a `to` prop, but we don't have one. maybe this should be a button?
          <EntityNameLink //force line break so we can type check next line
            onClick={() => onSelect?.(entity)}
          >
            {entityName}
          </EntityNameLink>
        ) : (
          <Flex gap="xs" fw="bold">
            {entityName}
            {entity.icon}
          </Flex>
        )}
        {entity.callout && <Text c="text-secondary">{entity.callout}</Text>}
      </PermissionsTableCell>

      {entity.permissions?.map((permission, index) => {
        return (
          <PermissionsTableCell key={permission.type ?? String(index)}>
            <PermissionsSelect
              {...permission}
              onChange={(value, toggleState) =>
                onChange(value, toggleState, entity, permission)
              }
              onAction={(action) => onAction?.(action, entity)}
            />
          </PermissionsTableCell>
        );
      })}
    </PermissionsTableRow>
  );
});
