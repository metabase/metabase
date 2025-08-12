import { Node, mergeAttributes, nodePasteRule } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { memo, useEffect } from "react";
import { t } from "ttag";

import { cardApi } from "metabase/api";
import { collectionApi } from "metabase/api/collection";
import { dashboardApi } from "metabase/api/dashboard";
import { databaseApi } from "metabase/api/database";
import { tableApi } from "metabase/api/table";
import { getIcon } from "metabase/lib/icon";
import { modelToUrl } from "metabase/lib/urls/modelToUrl";
import { extractEntityId } from "metabase/lib/urls/utils";
import { Icon } from "metabase/ui";
import { updateMentionsCache } from "metabase-enterprise/documents/documents.slice";
import { useDocumentsDispatch } from "metabase-enterprise/documents/redux-utils";
import type { SearchModel } from "metabase-types/api";

import styles from "./SmartLinkNode.module.css";

export interface SmartLinkAttributes {
  entityId: number;
  model: string;
}

// Utility function to parse entity URLs and extract entityId and model
export function parseEntityUrl(
  url: string,
  siteUrl?: string,
): { entityId: number; model: SearchModel } | null {
  try {
    const urlObj = new URL(url);

    // Validate URL matches the site-url if provided
    if (siteUrl) {
      const siteUrlObj = new URL(siteUrl);

      // Check if origins match
      if (urlObj.origin !== siteUrlObj.origin) {
        return null; // URL is not from this Metabase instance
      }

      // Check if the path starts with the site-url path
      const siteUrlPath = siteUrlObj.pathname;
      if (!urlObj.pathname.startsWith(siteUrlPath)) {
        return null; // URL is not under the correct path
      }
    } else {
      // Fallback: validate against current window origin
      if (urlObj.origin !== window.location.origin) {
        return null;
      }
    }

    // Remove site-url path prefix if present to get the clean pathname
    let cleanPathname = urlObj.pathname;
    if (siteUrl) {
      const siteUrlPath = new URL(siteUrl).pathname;
      // Remove the site-url path prefix, ensuring we don't create double slashes
      cleanPathname = urlObj.pathname.replace(siteUrlPath, "");
      // Ensure the pathname starts with /
      if (!cleanPathname.startsWith("/")) {
        cleanPathname = "/" + cleanPathname;
      }
    }

    // Match different entity URL patterns
    const patterns = [
      { pattern: /^\/question\/(\d+)/, model: "card" as SearchModel },
      { pattern: /^\/model\/(\d+)/, model: "dataset" as SearchModel },
      { pattern: /^\/dashboard\/(\d+)/, model: "dashboard" as SearchModel },
      { pattern: /^\/collection\/(\d+)/, model: "collection" as SearchModel },
      {
        pattern: /^\/browse\/(\d+)\/table\/(\d+)/,
        model: "table" as SearchModel,
        idIndex: 2,
      },
      { pattern: /^\/browse\/(\d+)/, model: "database" as SearchModel },
    ];

    for (const { pattern, model, idIndex = 1 } of patterns) {
      const match = cleanPathname.match(pattern);
      if (match) {
        const entityId = extractEntityId(match[idIndex]);
        if (entityId) {
          return { entityId, model };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export const SmartLinkNode = Node.create<{
  HTMLAttributes: Record<string, unknown>;
  siteUrl?: string;
}>({
  name: "smartLink",
  group: "inline",
  inline: true,
  atom: true,
  priority: 1000, // Higher priority than Link extension (default 100)

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

  addPasteRules() {
    return [
      nodePasteRule({
        find: /https?:\/\/[^\s]+/g,
        type: this.type,
        getAttributes: (match) => {
          const url = match[0];
          const parsedEntity = parseEntityUrl(url, this.options.siteUrl);

          if (parsedEntity) {
            return {
              entityId: parsedEntity.entityId,
              model: parsedEntity.model,
            };
          }

          return null; // Return null to prevent node creation
        },
      }),
    ];
  },
});

const useEntityData = (entityId: number | null, model: SearchModel | null) => {
  const cardQuery = cardApi.useGetCardQuery(
    { id: entityId! },
    { skip: !entityId || (model !== "card" && model !== "dataset") },
  );

  const dashboardQuery = dashboardApi.useGetDashboardQuery(
    { id: entityId! },
    { skip: !entityId || model !== "dashboard" },
  );

  const collectionQuery = collectionApi.useGetCollectionQuery(
    { id: entityId! },
    { skip: !entityId || model !== "collection" },
  );

  const tableQuery = tableApi.useGetTableQuery(
    { id: entityId! },
    { skip: !entityId || model !== "table" },
  );

  const databaseQuery = databaseApi.useGetDatabaseQuery(
    { id: entityId! },
    { skip: !entityId || model !== "database" },
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

    const documentsDispatch = useDocumentsDispatch();
    useEffect(() => {
      if (entity?.name) {
        documentsDispatch(
          updateMentionsCache({ entityId, model, name: entity.name }),
        );
      }
    }, [documentsDispatch, entity?.name, entityId, model]);

    if (isLoading) {
      return (
        <NodeViewWrapper as="span">
          <span className={styles.smartLink}>
            <span className={styles.smartLinkInner}>
              <Icon name="hourglass" className={styles.icon} />
              {t`Loading ${model}...`}
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
              {error ? t`Failed to load` : t`Unknown`} {model}
            </span>
          </span>
        </NodeViewWrapper>
      );
    }

    const entityUrl = modelToUrl({
      id: entity.id,
      model: entity.model || model,
      name: entity.name,
      database: entity.db_id
        ? { id: entity.db_id }
        : entity.database_id
          ? { id: entity.database_id }
          : undefined,
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
