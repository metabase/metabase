import { Node, mergeAttributes, nodePasteRule } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { memo, useEffect } from "react";
import { t } from "ttag";
import { isObject } from "underscore";

import {
  useGetActionQuery,
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
  useGetDatabaseQuery,
  useGetDocumentQuery,
  useGetSegmentQuery,
  useGetTableQuery,
  useListMentionsQuery,
} from "metabase/api";
import Link from "metabase/common/components/Link";
import { updateMentionsCache } from "metabase/documents/documents.slice";
import {
  type IconModel,
  type ObjectWithModel,
  getIcon,
} from "metabase/lib/icon";
import { useDispatch } from "metabase/lib/redux";
import { modelToUrl } from "metabase/lib/urls/modelToUrl";
import { extractEntityId } from "metabase/lib/urls/utils";
import {
  METABSE_PROTOCOL_MD_LINK,
  parseMetabaseProtocolMarkdownLink,
} from "metabase/metabot/utils/links";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { Icon } from "metabase/ui";
import type {
  Card,
  CardDisplayType,
  Collection,
  Dashboard,
  Database,
  Document,
  MentionableUser,
  Segment,
  Table,
  Transform,
  WritebackAction,
} from "metabase-types/api";

import {
  entityToUrlableModel,
  isMentionableUser,
  mbProtocolModelToSuggestionModel,
} from "../shared/suggestionUtils";
import type { SuggestionModel } from "../shared/types";

import styles from "./SmartLinkNode.module.css";

export type SmartLinkEntity =
  | Card
  | Dashboard
  | Collection
  | Table
  | Transform
  | Database
  | Document
  | WritebackAction
  | Segment
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
      { pattern: /^\/metric\/(\d+)/, model: "metric" },
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
      href: {
        default: "/",
        parseHTML: (element) => element.getAttribute("data-href"),
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

  renderHTML({ node }) {
    const { entityId, model, label, href } = node.attrs;

    return [
      "a",
      mergeAttributes(
        {
          "data-type": "smart-link",
          "data-entity-id": entityId,
          "data-model": model,
          "data-label": label ?? undefined,
          "data-site-url": this.options.siteUrl,
          href: this.options.siteUrl + href,
          style: "text-decoration: none;",
        },
        this.options.HTMLAttributes,
      ),
      // 0 is Tiptap’s “content placeholder,” which tells it to render the node’s inner content.
      label ?? 0,
    ];
  },

  renderText({ node }) {
    const { entityId, model } = node.attrs;

    return `{% entity id="${entityId}" model="${model}" %}`;
  },

  addPasteRules() {
    return [
      {
        find: /https?:\/\/[^\s]+/g,
        handler: ({ state, range, match }) => {
          const url = match[0];

          // Check if the preceding characters are "](" which indicates the user is typing a markdown link
          const start = range.from;
          if (start >= 2) {
            const textBefore = state.doc.textBetween(start - 2, start);
            if (textBefore === "](") {
              return;
            }
          }

          const parsedEntity = parseEntityUrl(url, this.options.siteUrl);

          if (parsedEntity) {
            state.tr.replaceRangeWith(
              range.from,
              range.to,
              this.type.create({
                entityId: parsedEntity.entityId,
                model: parsedEntity.model,
              }),
            );
          }
        },
      },
      nodePasteRule({
        find: new RegExp(METABSE_PROTOCOL_MD_LINK, "g"),
        type: this.type,
        getAttributes: (match) => {
          const url = match[0];
          const parsedEntity = parseMetabaseProtocolMarkdownLink(url);

          if (parsedEntity) {
            const model = mbProtocolModelToSuggestionModel(parsedEntity?.model);

            return {
              entityId: parsedEntity.id,
              model,
              label: parsedEntity.name,
            };
          }

          return null; // Return null to prevent node creation
        },
      }),
    ];
  },
});

function assertUnreachable(value: never) {
  console.warn(`Unhandled model type: ${value}`);
}

export const useEntityData = (
  entityId: number | null,
  model: SuggestionModel | null,
) => {
  const isCard = model && ["card", "dataset", "metric"].includes(model);
  const cardQuery = useGetCardQuery(
    { id: entityId!, ignore_error: true },
    { skip: !entityId || !isCard },
  );

  const dashboardQuery = useGetDashboardQuery(
    { id: entityId!, ignore_error: true },
    { skip: !entityId || model !== "dashboard" },
  );

  const collectionQuery = useGetCollectionQuery(
    { id: entityId!, ignore_error: true },
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

  const transformQuery = PLUGIN_TRANSFORMS.useGetTransformQuery(entityId!, {
    skip: !PLUGIN_TRANSFORMS.isEnabled || !entityId || model !== "transform",
  });

  const actionQuery = useGetActionQuery(
    { id: entityId! },
    { skip: !entityId || model !== "action" },
  );

  const segmentQuery = useGetSegmentQuery(entityId!, {
    skip: !entityId || model !== "segment",
  });

  const usersQuery = useListMentionsQuery(undefined, {
    skip: !entityId || model !== "user",
  });

  // Determine which query is active and return its state
  switch (model) {
    case "card":
    case "dataset":
    case "metric":
      return {
        entity: cardQuery.data,
        isLoading: cardQuery.isLoading,
        error: cardQuery.error,
      };
    case "dashboard":
      return {
        entity: dashboardQuery.data,
        isLoading: dashboardQuery.isLoading,
        error: dashboardQuery.error,
      };
    case "collection":
      return {
        entity: collectionQuery.data,
        isLoading: collectionQuery.isLoading,
        error: collectionQuery.error,
      };
    case "table":
      return {
        entity: tableQuery.data,
        isLoading: tableQuery.isLoading,
        error: tableQuery.error,
      };
    case "database":
      return {
        entity: databaseQuery.data,
        isLoading: databaseQuery.isLoading,
        error: databaseQuery.error,
      };
    case "document":
      return {
        entity: documentQuery.data,
        isLoading: documentQuery.isLoading,
        error: documentQuery.error,
      };
    case "transform":
      return {
        entity: transformQuery.data,
        isLoading: transformQuery.isLoading,
        error: transformQuery.error,
      };
    case "action":
      return {
        entity: actionQuery.data,
        isLoading: actionQuery.isLoading,
        error: actionQuery.error,
      };
    case "segment":
      return {
        entity: segmentQuery.data,
        isLoading: segmentQuery.isLoading,
        error: segmentQuery.error,
      };
    case "user": {
      const user = usersQuery.data?.data.find((user) => user.id === entityId);

      return {
        entity: user ? { ...user, name: user.common_name } : null,
        isLoading: usersQuery.isLoading,
        error: usersQuery.error,
      };
    }
    case "indexed-entity":
    case null:
      return { entity: null, isLoading: false, error: null };
    default:
      assertUnreachable(model);
      return { entity: null, isLoading: false, error: null };
  }
};

export const SmartLinkComponent = memo(
  ({ node }: NodeViewProps) => {
    const { entityId, model, label } = node.attrs;

    const {
      entity: networkEntity,
      isLoading,
      error,
    } = useEntityData(entityId, model);
    const cachedEntity = { id: parseInt(entityId, 10), model, name: label };
    const entity = networkEntity || cachedEntity;

    const dispatch = useDispatch();
    useEffect(() => {
      if (entity) {
        const name =
          "display_name" in entity ? entity.display_name : entity?.name;
        dispatch(updateMentionsCache({ entityId, model, name }));
      }
    }, [dispatch, entity, entityId, model]);

    const showLoading = isLoading && !entity;
    if (showLoading) {
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
              {isObject(error) && error.status === 403 ? (
                <>
                  <Icon name="eye_crossed_out" className={styles.icon} />
                  {t`No access`}
                </>
              ) : (
                <>
                  <Icon name="warning" className={styles.icon} />
                  {error ? t`Failed to load` : t`Unknown`} {model}
                </>
              )}
            </span>
          </span>
        </NodeViewWrapper>
      );
    }

    if (model === "user" && isMentionableUser(entity)) {
      return (
        <NodeViewWrapper as="span">
          <span className={styles.userMention}>@{entity.common_name}</span>
        </NodeViewWrapper>
      );
    }

    const entityUrlableModel = entityToUrlableModel(entity, model);
    const entityUrl = modelToUrl(entityUrlableModel);

    const iconData =
      entity === cachedEntity
        ? getIcon(cachedEntity)
        : getIcon(
            entityToObjectWithModel(
              entity as NonNullable<typeof networkEntity>,
              model,
            ),
          );

    return (
      <NodeViewWrapper as="span" data-type="smart-link">
        <Link
          to={entityUrl || "#"}
          target="_blank"
          rel="noreferrer"
          tabIndex={-1}
          onMouseUp={(e) => {
            // Stop tiptap from opening this link twice
            e.stopPropagation();
          }}
          className={styles.smartLink}
        >
          <span className={styles.smartLinkInner}>
            <Icon name={iconData.name} className={styles.icon} />
            {getName(entity)}
          </span>
        </Link>
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

function getName(entity: { name?: string; display_name?: string }) {
  if ("display_name" in entity && entity.display_name !== "") {
    return entity.display_name;
  }
  if ("name" in entity && entity.name !== "") {
    return entity.name;
  }
  return "";
}
