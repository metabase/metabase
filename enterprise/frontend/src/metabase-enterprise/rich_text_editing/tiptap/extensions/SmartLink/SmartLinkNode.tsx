import { Node, mergeAttributes, nodePasteRule } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { memo, useEffect } from "react";
import { t } from "ttag";

import {
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
  useGetDatabaseQuery,
  useGetTableQuery,
} from "metabase/api";
import {
  type IconModel,
  type ObjectWithModel,
  getIcon,
} from "metabase/lib/icon";
import { useDispatch } from "metabase/lib/redux";
import { type UrlableModel, modelToUrl } from "metabase/lib/urls/modelToUrl";
import { extractEntityId } from "metabase/lib/urls/utils";
import { Icon } from "metabase/ui";
import {
  useGetDocumentQuery,
  useListMentionsQuery,
} from "metabase-enterprise/api";
import type { SuggestionModel } from "metabase-enterprise/documents/components/Editor/types";
import { updateMentionsCache } from "metabase-enterprise/documents/documents.slice";
import type {
  Card,
  CardDisplayType,
  Collection,
  Dashboard,
  Database,
  Document,
  MentionableUser,
  Table,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import styles from "./SmartLinkNode.module.css";

type SmartLinkEntity =
  | Card
  | Dashboard
  | Collection
  | Table
  | Database
  | Document
  | MentionableUser;

// Utility function to parse entity URLs and extract entityId and model
export function parseEntityUrl(
  url: string,
  siteUrl?: string,
): { entityId: number; model: SuggestionModel } | null {
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
    const patterns: {
      pattern: RegExp;
      model: SuggestionModel;
      idIndex?: number;
    }[] = [
      { pattern: /^\/question\/(\d+)/, model: "card" },
      { pattern: /^\/model\/(\d+)/, model: "dataset" },
      { pattern: /^\/dashboard\/(\d+)/, model: "dashboard" },
      { pattern: /^\/collection\/(\d+)/, model: "collection" },
      {
        pattern: /^\/browse\/(\d+)\/table\/(\d+)/,
        model: "table",
        idIndex: 2,
      },
      { pattern: /^\/browse\/(\d+)/, model: "database" },
      { pattern: /^\/document\/(\d+)/, model: "document" },
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

export const SmartLink = Node.create<{
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
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(SmartLinkComponent);
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
          "data-label": node.attrs.label ?? undefined,
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

const useEntityData = (
  entityId: number | null,
  model: SuggestionModel | null,
) => {
  const cardQuery = useGetCardQuery(
    { id: entityId! },
    { skip: !entityId || (model !== "card" && model !== "dataset") },
  );

  const dashboardQuery = useGetDashboardQuery(
    { id: entityId! },
    { skip: !entityId || model !== "dashboard" },
  );

  const collectionQuery = useGetCollectionQuery(
    { id: entityId! },
    { skip: !entityId || model !== "collection" },
  );

  const tableQuery = useGetTableQuery(
    { id: entityId! },
    { skip: !entityId || model !== "table" },
  );

  const databaseQuery = useGetDatabaseQuery(
    { id: entityId! },
    { skip: !entityId || model !== "database" },
  );

  const documentQuery = useGetDocumentQuery(
    {
      id: entityId!,
    },
    {
      skip: !entityId || model !== "document",
    },
  );

  const usersQuery = useListMentionsQuery(undefined, {
    skip: !entityId || model !== "user",
  });

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

  if (model === "document") {
    return {
      entity: documentQuery.data,
      isLoading: documentQuery.isLoading,
      error: documentQuery.error,
    };
  }

  if (model === "user") {
    const user = usersQuery.data?.data.find((user) => user.id === entityId);

    return {
      entity: user ? { ...user, name: user.common_name } : null,
      isLoading: usersQuery.isLoading,
      error: usersQuery.error,
    };
  }

  return { entity: null, isLoading: false, error: null };
};

export const SmartLinkComponent = memo(
  ({ node }: NodeViewProps) => {
    const { entityId, model } = node.attrs;
    const { entity, isLoading, error } = useEntityData(entityId, model);

    const dispatch = useDispatch();
    useEffect(() => {
      if (entity?.name) {
        dispatch(updateMentionsCache({ entityId, model, name: entity.name }));
      }
    }, [dispatch, entity?.name, entityId, model]);

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

    if (model === "user" && isMentionableUser(entity)) {
      return (
        <NodeViewWrapper as="span">
          <span className={styles.userMention}>@{entity.name}</span>
        </NodeViewWrapper>
      );
    }

    const entityUrlableModel = entityToUrlableModel(entity, model);
    const entityUrl = modelToUrl(entityUrlableModel);

    const iconData = getIcon(entityToObjectWithModel(entity, model));

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
            {("display_name" in entity && entity.display_name) || entity.name}
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

function entityToUrlableModel(
  entity: SmartLinkEntity,
  model: SuggestionModel | null,
): UrlableModel {
  const result: UrlableModel = {
    id: entity.id as number, // it is string | number in reality, but then gets casted to a string in "modelToUrl"
    model: (entity as Dashboard).model || model || "",
    name: isMentionableUser(entity) ? entity.common_name : entity.name,
  };

  if ("db_id" in entity && entity.db_id) {
    result.database = {
      id: entity.db_id,
    };
  }

  if ("database_id" in entity && entity.database_id) {
    result.database = { id: entity.database_id };
  }

  return result;
}

function entityToObjectWithModel(
  entity: SmartLinkEntity,
  model: SuggestionModel | null,
): ObjectWithModel {
  return {
    model: ((entity as Dashboard).model || model || "") as IconModel,
    display: (entity as Card).display as CardDisplayType,
    is_personal: (entity as Collection).is_personal,
  };
}

function isMentionableUser(value: unknown): value is MentionableUser {
  return isObject(value) && typeof value.common_name === "string";
}
