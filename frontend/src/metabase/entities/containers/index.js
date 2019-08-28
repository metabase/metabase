import React from "react";

import EntityListLoader, { entityListLoader } from "./EntityListLoader";
import EntityObjectLoader, { entityObjectLoader } from "./EntityObjectLoader";
import EntityName from "./EntityName";
import EntityForm from "./EntityForm";

export function addEntityContainers(entity) {
  const ObjectName = entity.nameOne;

  // Entity.load higher-order component
  entity.load = ({ id, ...props } = {}) =>
    entityObjectLoader({ entityType: entity.name, entityId: id, ...props });

  // Entity.Loader component
  entity.Loader = ({ id, ...props }) => (
    <EntityObjectLoader entityType={entity.name} entityId={id} {...props} />
  );
  entity.Loader.displayName = `${ObjectName}.Loader`;

  // Entity.loadList higher-order component
  entity.loadList = ({ query, ...props } = {}) =>
    entityListLoader({ entityType: entity.name, entityQuery: query, ...props });

  // Entity.ListLoader component
  entity.ListLoader = ({ query, ...props }) => (
    <EntityListLoader entityType={entity.name} entityQuery={query} {...props} />
  );
  entity.ListLoader.displayName = `${ObjectName}.ListLoader`;

  // Entity.Name component
  entity.Name = ({ id, ...props }) => (
    <EntityName entityType={entity.name} entityId={id} {...props} />
  );
  entity.Name.displayName = `${ObjectName}.Name`;

  // Entity.Form component
  entity.Form = ({ object, ...props }) => (
    <EntityForm
      entityType={entity.name}
      entityObject={object || props[entity.nameOne]}
      {...props}
    />
  );
  entity.Form.displayName = `${ObjectName}.Form`;

  // Entity.ModalForm component
  entity.ModalForm = ({ object, ...props }) => (
    <EntityForm
      modal
      entityType={entity.name}
      entityObject={object || props[entity.nameOne]}
      {...props}
    />
  );
  entity.ModalForm.displayName = `${ObjectName}.ModalForm`;
}
