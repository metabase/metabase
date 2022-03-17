import React, { useState, useRef } from "react";
import PropTypes from "prop-types";

import Tooltip from "metabase/components/Tooltip";
import Modal from "metabase/components/Modal";
import ConfirmContent from "metabase/components/ConfirmContent";

import { PermissionsSelect } from "../PermissionsSelect";
import {
  PermissionsTableRoot,
  PermissionsTableRow,
  PermissionsTableCell,
  PermissionTableHeaderCell,
  EntityNameLink,
  EntityName,
  HintIcon,
  ColumnName,
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
    setConfirmations(prev => prev.slice(1));
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
                      <Tooltip placement="right" tooltip={hint}>
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
          {entities.map(entity => {
            return (
              <PermissionsTableRow key={entity.id}>
                <PermissionsTableCell>
                  {entity.canSelect ? (
                    <EntityNameLink onClick={() => onSelect(entity)}>
                      {entity.name}
                    </EntityNameLink>
                  ) : (
                    <EntityName>{entity.name}</EntityName>
                  )}

                  {entity.hint && (
                    <Tooltip tooltip={entity.hint}>
                      <HintIcon />
                    </Tooltip>
                  )}
                </PermissionsTableCell>

                {entity.permissions.map(permission => {
                  return (
                    <PermissionsTableCell key={permission.type}>
                      <PermissionsSelect
                        {...permission}
                        onChange={(value, toggleState) =>
                          handleChange(value, toggleState, entity, permission)
                        }
                        onAction={actionCreator =>
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
      {confirmations?.length > 0 && (
        <Modal>
          <ConfirmContent
            {...confirmations[0]}
            onAction={handleConfirm}
            onCancel={handleCancelConfirm}
          />
        </Modal>
      )}
    </>
  );
}

PermissionsTable.propTypes = propTypes;
