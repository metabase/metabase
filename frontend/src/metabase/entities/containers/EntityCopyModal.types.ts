import type { CopyDashboardFormProperties } from "metabase/dashboard/containers/CopyDashboardForm";
import type { CopyDocumentProperties } from "metabase/documents/components/DocumentCopyForm/DocumentCopyForm";
import type { CopyCardProperties } from "metabase/questions/components/CopyCardForm/CopyCardForm";
import type { Card, Dashboard } from "metabase-types/api";
import type { Document } from "metabase-types/api/document";

/**
 * Registry mapping entityType strings to their form properties and entity types.
 * To add a new entity type, extend this interface.
 */
export interface EntityCopyTypeRegistry {
  dashboards: {
    formProperties: CopyDashboardFormProperties;
    entity: Dashboard;
  };
  cards: {
    formProperties: CopyCardProperties;
    entity: Card;
  };
  documents: {
    formProperties: CopyDocumentProperties;
    entity: Document;
  };
}

export type CopyableEntityType = keyof EntityCopyTypeRegistry;

export interface EntityCopyModalProps<T extends CopyableEntityType> {
  entityType: T;
  entityObject: any;
  copy: (
    data: EntityCopyTypeRegistry[T]["formProperties"],
  ) => Promise<EntityCopyTypeRegistry[T]["entity"]>;
  title?: string;
  onClose: () => void;
  onSaved: (newEntity: EntityCopyTypeRegistry[T]["entity"]) => void;
  overwriteOnInitialValuesChange?: boolean;
  onValuesChange?: (
    values: EntityCopyTypeRegistry[T]["formProperties"],
  ) => void;
}

export interface GenericEntityCopyModalProps {
  entityType: string;
  entityObject: any;
  copy: (data: any) => Promise<any>;
  title?: string;
  onClose: () => void;
  onSaved: (newEntity?: any) => void;
  overwriteOnInitialValuesChange?: boolean;
  onValuesChange?: (values: any) => void;
}
