import cx from "classnames";
import { useRef, useState } from "react";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { Flex, Icon, Text, Tooltip } from "metabase/ui";

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
  emptyState?: React.ReactNode;
};

export function PermissionsTable({
  entities,
  columns,
  onSelect,
  onAction,
  onChange,
  emptyState = null,
}: PermissionsTableProps) {
  const [confirmations, setConfirmations] = useState<
    PermissionConfirmationProps[]
  >([]);
  const confirmActionRef = useRef<(() => void) | null>(null);

  const handleChange = (
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
  };

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

  const hasItems = entities.length > 0;

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
                        <Icon
                          name="info"
                          c="text-tertiary"
                          ml="0.375rem"
                          className={CS.cursorPointer}
                        />
                      </Tooltip>
                    )}
                  </ColumnName>
                </PermissionTableHeaderCell>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => {
            const entityName = (
              <span className={cx(CS.flex, CS.alignCenter)}>
                <Ellipsified>{entity.name}</Ellipsified>
                {typeof entity.hint === "string" && (
                  <Tooltip label={entity.hint}>
                    <Icon
                      name="info"
                      c="text-tertiary"
                      ml="0.375rem"
                      className={CS.cursorPointer}
                    />
                  </Tooltip>
                )}
              </span>
            );
            return (
              <PermissionsTableRow
                key={entity.id}
                aria-label={`${entity.name} permissions`}
              >
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
                  {entity.callout && (
                    <Text c="text-secondary">{entity.callout}</Text>
                  )}
                </PermissionsTableCell>

                {entity.permissions?.map((permission, index) => {
                  return (
                    <PermissionsTableCell
                      key={permission.type ?? String(index)}
                    >
                      <PermissionsSelect
                        {...permission}
                        onChange={(value, toggleState) =>
                          handleChange(value, toggleState, entity, permission)
                        }
                        onAction={(action) => onAction?.(action, entity)}
                      />
                    </PermissionsTableCell>
                  );
                })}
              </PermissionsTableRow>
            );
          })}
        </tbody>
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
