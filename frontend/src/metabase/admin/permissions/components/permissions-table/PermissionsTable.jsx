import React from "react";
import PropTypes from "prop-types";
import { PermissionSelect } from "../permissions-select";
import Label from "metabase/components/type/Label";

import {
  PermissionsTableRoot,
  PermissionsTableRow,
  PermissionsTableCell,
  EntityNameCell,
  EntityNameLink,
} from "./PermissionsTable.styled";

const propTypes = {
  entityName: PropTypes.string.isRequired,
  entities: PropTypes.arrayOf(PropTypes.object),
  emptyState: PropTypes.node,
  permissions: PropTypes.arrayOf(
    PropTypes.shape({
      displayName: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      options: PropTypes.arrayOf(
        PropTypes.shape({
          label: PropTypes.string.isRequired,
          value: PropTypes.string.isRequired,
          icon: PropTypes.string.isRequired,
          color: PropTypes.string.isRequired,
        }),
      ),
    }),
  ),
};

export function PermissionsTable({
  entities,
  entityName,
  permissions,
  emptyState = null,
}) {
  const hasItems = entities.length > 0;

  return (
    <React.Fragment>
      <PermissionsTableRoot>
        <thead>
          <tr>
            <PermissionsTableCell style={{ width: "340px" }}>
              <Label>{entityName}</Label>
            </PermissionsTableCell>
            {permissions.map((permission, index) => {
              const isLast = index === permissions.length - 1;

              return (
                <PermissionsTableCell
                  key={permission.name}
                  style={isLast ? null : { width: "200px" }}
                >
                  <Label>{permission.displayName}</Label>
                </PermissionsTableCell>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {entities.map(entity => {
            return (
              <PermissionsTableRow key={entity.id}>
                <EntityNameCell>
                  <EntityNameLink>{entity.name}</EntityNameLink>
                </EntityNameCell>

                {permissions.map(permission => {
                  const permissionState = entity.permissions[permission.name];
                  return (
                    <PermissionsTableCell key={permission.name}>
                      <PermissionSelect
                        {...permissionState}
                        options={permission.options}
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
    </React.Fragment>
  );
}

PermissionsTable.propTypes = propTypes;
