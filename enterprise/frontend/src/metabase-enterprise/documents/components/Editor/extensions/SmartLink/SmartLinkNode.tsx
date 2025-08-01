import { Node, mergeAttributes } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { memo } from "react";

import { cardApi } from "metabase/api";
import { dashboardApi } from "metabase/api/dashboard";
import { collectionApi } from "metabase/api/collection";
import { tableApi } from "metabase/api/table";
import { databaseApi } from "metabase/api/database";
import { getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls/modelToUrl";
import { Icon } from "metabase/ui";
import type { SearchModel } from "metabase-types/api";

import styles from "./SmartLinkNode.module.css";

export interface SmartLinkAttributes {
  entityId: number;
  model: string;
}

export const SmartLinkNode = Node.create<{
  HTMLAttributes: Record<string, unknown>;
}>({
  name: "smartLink",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      entityId: {
        default: null,
        parseHTML: (element) => {
          const id = element.getAttribute("data-entity-id");
          return id ? parseInt(id, 10) : null;
        },
      },
      model: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-model"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="smart-link"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { entityId, model } = node.attrs;
    
    return [
      "span",
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": "smart-link",
          "data-entity-id": entityId,
          "data-model": model,
        },
        this.options.HTMLAttributes,
      ),
      `{% entity id="${entityId}" model="${model}" %}`,
    ];
  },

  renderText({ node }) {
    const { entityId, model } = node.attrs;
    
    return `{% entity id="${entityId}" model="${model}" %}`;
  },
});

const useEntityData = (entityId: number | null, model: SearchModel | null) => {
  // Use different API hooks based on the model type
  const cardQuery = cardApi.useGetCardQuery(
    { id: entityId! },
    { skip: !entityId || (model !== "card" && model !== "dataset") }
  );
  
  const dashboardQuery = dashboardApi.useGetDashboardQuery(
    { id: entityId! },
    { skip: !entityId || model !== "dashboard" }
  );
  
  const collectionQuery = collectionApi.useGetCollectionQuery(
    { id: entityId! },
    { skip: !entityId || model !== "collection" }
  );
  
  const tableQuery = tableApi.useGetTableQuery(
    { id: entityId! },
    { skip: !entityId || model !== "table" }
  );
  
  const databaseQuery = databaseApi.useGetDatabaseQuery(
    { id: entityId! },
    { skip: !entityId || model !== "database" }
  );

  // Determine which query is active and return its state
  if (model === "card" || model === "dataset") {
    return {
      entity: cardQuery.data,
      isLoading: cardQuery.isLoading,
      error: cardQuery.error,
    };
  }
  
  if (model === "dashboard") {
    return {
      entity: dashboardQuery.data,
      isLoading: dashboardQuery.isLoading,
      error: dashboardQuery.error,
    };
  }
  
  if (model === "collection") {
    return {
      entity: collectionQuery.data,
      isLoading: collectionQuery.isLoading,
      error: collectionQuery.error,
    };
  }
  
  if (model === "table") {
    return {
      entity: tableQuery.data,
      isLoading: tableQuery.isLoading,
      error: tableQuery.error,
    };
  }
  
  if (model === "database") {
    return {
      entity: databaseQuery.data,
      isLoading: databaseQuery.isLoading,
      error: databaseQuery.error,
    };
  }

  return { entity: null, isLoading: false, error: null };
};

export const SmartLinkComponent = memo(
  ({ node }: NodeViewProps) => {
    const { entityId, model } = node.attrs;
    const { entity, isLoading, error } = useEntityData(entityId, model);

    if (isLoading) {
      return (
        <NodeViewWrapper as="span">
          <span className={styles.smartLink}>
            <span className={styles.smartLinkInner}>
              <Icon name="hourglass" className={styles.icon} />
              Loading {model}...
            </span>
          </span>
        </NodeViewWrapper>
      );
    }

    if (error || !entity) {
      return (
        <NodeViewWrapper as="span">
          <span className={styles.smartLink}>
            <span className={styles.smartLinkInner}>
              <Icon name="warning" className={styles.icon} />
              {error ? "Failed to load" : "Unknown"} {model}
            </span>
          </span>
        </NodeViewWrapper>
      );
    }

    const entityUrl = modelToUrl({
      id: entity.id,
      model: entity.model || model,
      name: entity.name,
      database: entity.database_id ? { id: entity.database_id } : undefined,
    });

    const iconData = getIcon({
      model: entity.model || model,
      display: entity.display,
      is_personal: entity.is_personal,
    });

    return (
      <NodeViewWrapper as="span">
        <a
          href={entityUrl || "#"}
          target="_blank"
          rel="noreferrer"
          onMouseUp={(e) => {
            // Stop tiptap from opening this link twice
            e.stopPropagation();
          }}
          className={styles.smartLink}
        >
          <span className={styles.smartLinkInner}>
            <Icon name={iconData.name} className={styles.icon} />
            {entity.name}
          </span>
        </a>
      </NodeViewWrapper>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function to prevent re-renders
    // Only re-render if these specific props change
    return (
      prevProps.node.attrs.entityId === nextProps.node.attrs.entityId &&
      prevProps.node.attrs.model === nextProps.node.attrs.model &&
      prevProps.selected === nextProps.selected
    );
  },
);

SmartLinkComponent.displayName = "SmartLinkComponent";
