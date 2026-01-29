import cx from "classnames";
import PropTypes from "prop-types";
import { useRef, useState } from "react";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { Flex, Text, Tooltip } from "metabase/ui";

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

const propTypes = {
  entities: PropTypes.arrayOf(PropTypes.object),
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      hint: PropTypes.string,
    }),
  ),
  emptyState: PropTypes.node,
  onSelect: PropTypes.func,
  onChange: PropTypes.func,
  onAction: PropTypes.func,
  colorScheme: PropTypes.oneOf(["default", "admin"]),
};

export function PermissionsTable({
  entities,
  columns,
  onSelect,
  onAction,
  onChange,
  colorScheme,
  emptyState = null,
}) {
  const [confirmations, setConfirmations] = useState([]);
  const confirmActionRef = useRef(null);

  const handleChange = (value, toggleState, entity, permission) => {
    const confirmAction = () =>
      onChange(entity, permission, value, toggleState);

    const confirmations =
      permission.confirmations?.(value).filter(Boolean) || [];

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
      confirmActionRef.current();
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
                        <HintIcon />
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
                  <Tooltip tooltip={entity.hint}>
                    <HintIcon />
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
                    <EntityNameLink onClick={() => onSelect(entity)}>
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

                {entity.permissions.map((permission, index) => {
                  return (
                    <PermissionsTableCell
                      key={permission.type ?? String(index)}
                    >
                      <PermissionsSelect
                        {...permission}
                        onChange={(value, toggleState) =>
                          handleChange(value, toggleState, entity, permission)
                        }
                        onAction={(actionCreator) =>
                          onAction(actionCreator, entity)
                        }
                        colorScheme={colorScheme}
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

PermissionsTable.propTypes = propTypes;
