import React, { useState, useRef } from "react";
import PropTypes from "prop-types";

import Label from "metabase/components/type/Label";
import Icon from "metabase/components/Icon";
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
  const [confirmations, setConfirmations] = useState(null);
  const confirmActionRef = useRef(null);

  const handleChange = (value, toggleState, entity, permission) => {
    const confirmAction = () => {
      onChange(entity, permission, value, toggleState);
    };
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
    if (confirmations.length === 1) {
      confirmActionRef.current();
      setConfirmations(null);
      confirmActionRef.current = null;
    } else {
      setConfirmations(prev => prev.slice(1));
    }
  };

  const handleCancelConfirm = () => {
    setConfirmations(null);
    confirmActionRef.current = null;
  };

  const hasItems = entities.length > 0;

  return (
    <React.Fragment>
      <PermissionsTableRoot data-testid="permission-table">
        <thead>
          <tr>
            {columns.map((column, index) => {
              const isFirst = index === 0;
              const isLast = index === columns.length - 1;

              const width = isFirst ? "340px" : isLast ? null : "200px";

              return (
                <PermissionsTableCell
                  key={column}
                  style={{ width }}
                  horizontalPadding={horizontalPadding}
                >
                  <Label>{column}</Label>
                </PermissionsTableCell>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {entities.map(entity => {
            return (
              <PermissionsTableRow key={entity.id}>
                <EntityNameCell horizontalPadding={horizontalPadding}>
                  {onSelect ? (
                    <EntityNameLink
                      onClick={() => onSelect && onSelect(entity)}
                    >
                      {entity.name}
                    </EntityNameLink>
                  ) : (
                    <EntityName>{entity.name}</EntityName>
                  )}

                  {entity.hint && (
                    <Tooltip tooltip="text">
                      <Icon
                        style={{ marginLeft: "0.25rem", cursor: "pointer" }}
                        name="question"
                      />
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
