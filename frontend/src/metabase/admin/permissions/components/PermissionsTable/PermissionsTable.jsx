import React, { useState, useRef } from "react";
import PropTypes from "prop-types";

import Label from "metabase/components/type/Label";
import Tooltip from "metabase/components/Tooltip";
import Modal from "metabase/components/Modal";
import ConfirmContent from "metabase/components/ConfirmContent";

import { PermissionsSelect } from "../PermissionsSelect";
import {
  PermissionsTableRoot,
  PermissionsTableRow,
  PermissionsTableCell,
  EntityNameCell,
  EntityNameLink,
  EntityName,
  HintIcon,
} from "./PermissionsTable.styled";

const propTypes = {
  entities: PropTypes.arrayOf(PropTypes.object),
  columns: PropTypes.arrayOf(PropTypes.string),
  emptyState: PropTypes.node,
  onSelect: PropTypes.func,
  onChange: PropTypes.func,
  onAction: PropTypes.func,
  colorScheme: PropTypes.oneOf(["default", "admin"]),
  horizontalPadding: PropTypes.oneOf(["sm", "lg"]),
};

export function PermissionsTable({
  entities,
  columns,
  onSelect,
  onAction,
  onChange,
  horizontalPadding = "sm",
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
    <React.Fragment>
      <PermissionsTableRoot data-testid="permission-table">
        <thead>
          <tr>
            {columns.map(column => {
              return (
                <PermissionsTableCell
                  key={column}
                  horizontalPadding={horizontalPadding}
                >
                  <Label>{column}</Label>
                </PermissionsTableCell>
              );
            })}
            <PermissionsTableCell
              style={{ width: "100%", minWidth: "unset" }}
            />
          </tr>
        </thead>
        <tbody>
          {entities.map(entity => {
            return (
              <PermissionsTableRow key={entity.id}>
                <EntityNameCell horizontalPadding={horizontalPadding}>
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
                </EntityNameCell>

                {entity.permissions.map(permission => {
                  return (
                    <PermissionsTableCell
                      key={permission.name}
                      horizontalPadding={horizontalPadding}
                    >
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
    </React.Fragment>
  );
}

PermissionsTable.propTypes = propTypes;
