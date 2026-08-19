import { Node, mergeAttributes, nodePasteRule } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { memo, useEffect } from "react";
import { t } from "ttag";
import { isObject } from "underscore";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Link } from "metabase/common/components/Link";
import type { IconModel, ObjectWithModel } from "metabase/common/utils/icon";
import { useGetIcon } from "metabase/hooks/use-icon";
import { useDispatch } from "metabase/redux";
import { useEditorHost } from "metabase/rich_text_editing/tiptap/EditorHost";
import { Icon } from "metabase/ui";
import {
  METABSE_PROTOCOL_MD_LINK,
  parseMetabaseProtocolMarkdownLink,
} from "metabase/urls";
import { modelToUrl } from "metabase/urls/modelToUrl";
import { extractEntityId } from "metabase/urls/utils";
import type {
  Card,
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
import { useEntityData } from "./use-entity-data";

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
        parseHTML: (element) => {
          const href = element.getAttribute("href");
          const siteUrl = element.getAttribute("data-site-url");

          // Remove siteUrl prefix if present to store relative path
          if (href && siteUrl && href.startsWith(siteUrl)) {
            return href.substring(siteUrl.length);
          }

          return href || element.getAttribute("data-href") || "/";
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(SmartLinkComponent);
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="smart-link"]',
        priority: 100, // Higher priority than default to override Link mark
        getAttrs: (element) => {
          if (typeof element === "string") {
            return false;
          }

          const entityId = element.getAttribute("data-entity-id");
          const model = element.getAttribute("data-model");

          // Only parse as smartLink if it has the required attributes
          if (!entityId || !model) {
            return false;
          }

          return null; // Return null to let the attribute parsers handle extraction
        },
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

export const SmartLinkComponent = memo(
  ({ node, updateAttributes }: NodeViewProps) => {
    const getIcon = useGetIcon();
    const { entityId, model, label } = node.attrs;

    const {
      entity: networkEntity,
      isLoading,
      error,
    } = useEntityData(entityId, model);
    const cachedEntity = { id: parseInt(entityId, 10), model, name: label };
    const entity = networkEntity || cachedEntity;

    const dispatch = useDispatch();
    const host = useEditorHost();
    useEffect(() => {
      if (entity) {
        const name =
          "display_name" in entity ? entity.display_name : entity?.name;
        updateAttributes({ label: name });
        dispatch(host.actions.updateMentionsCache({ entityId, model, name }));
      }
    }, [updateAttributes, dispatch, host, entity, entityId, model]);

    const showLoading = isLoading && !entity;
    if (showLoading) {
      return (
        <NodeViewWrapper as="span" data-type="smart-link">
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
        <NodeViewWrapper as="span" data-type="smart-link">
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
        <NodeViewWrapper as="span" data-type="smart-link">
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
              // Unjustified type cast. FIXME
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
            <EntityIcon {...iconData} className={styles.icon} />
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
    // Unjustified type cast. FIXME
    model: ((entity as Dashboard).model || model || "") as IconModel,
    // Unjustified type cast. FIXME
    display: (entity as Card).display,
    // Unjustified type cast. FIXME
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
