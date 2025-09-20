import { Node, mergeAttributes, nodePasteRule } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { useEffect } from "react";
import { push } from "react-router-redux";
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
import { Icon } from "metabase/ui";
import { useGetDocumentQuery } from "metabase-enterprise/api";
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
  Transform,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import styles from "./MetabotSmartLink.module.css";

type SmartLinkEntity =
  | Card
  | Dashboard
  | Collection
  | Table
  | Database
  | Document
  | Transform
  | MentionableUser;

export const MetabotSmartLink = Node.create<{
  HTMLAttributes: Record<string, unknown>;
  siteUrl?: string;
}>({
  name: "metabotSmartLink",
  group: "inline",
  inline: true,
  atom: true,
  priority: 1000,

  addPasteRules() {
    return [
      // Matches metabase protocal markdown link (e.g. "[entity name](metabase://model/id)")
      nodePasteRule({
        find: /\[(.*)\]\(metabase:\/\/(.*)\/(.*)?\)/g,
        type: this.type,
        getAttributes: ([, name, model, entityId]) => ({
          name,
          model,
          entityId,
        }),
      }),
    ];
  },

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
    return ReactNodeViewRenderer(MetabotSmartLinkNode);
  },

  parseHTML() {
    return [{ tag: 'span[data-type="metabot-smart-link"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { entityId, model } = node.attrs;

    return [
      "span",
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": "metabot-smart-link",
          "data-entity-id": entityId,
          "data-model": model,
          "data-label": node.attrs.label ?? undefined,
        },
        this.options.HTMLAttributes,
      ),
      `[${entityId}](metabase://${model}/${entityId})`,
    ];
  },

  renderText({ node }) {
    const { entityId, model } = node.attrs;
    return `[${entityId}](metabase://${model}/${entityId})`;
  },
});

const useEntityData = (entityId: number, model: SuggestionModel | null) => {
  // TODO: fix conditional calling later... it's friday and these won't change in practice
  const cardQuery =
    model === "card" || model === "dataset" || model === "metric"
      ? // eslint-disable-next-line react-hooks/rules-of-hooks -- todo
        useGetCardQuery({ id: entityId })
      : undefined;

  const dashboardQuery =
    // eslint-disable-next-line react-hooks/rules-of-hooks -- todo
    model === "dashboard" ? useGetDashboardQuery({ id: entityId }) : undefined;

  const collectionQuery =
    model === "collection"
      ? // eslint-disable-next-line react-hooks/rules-of-hooks -- todo
        useGetCollectionQuery({ id: entityId })
      : undefined;

  const tableQuery =
    // eslint-disable-next-line react-hooks/rules-of-hooks -- todo
    model === "table" ? useGetTableQuery({ id: entityId }) : undefined;

  const databaseQuery =
    // eslint-disable-next-line react-hooks/rules-of-hooks -- todo
    model === "database" ? useGetDatabaseQuery({ id: entityId }) : undefined;

  const documentQuery =
    // eslint-disable-next-line react-hooks/rules-of-hooks -- todo
    model === "document" ? useGetDocumentQuery({ id: entityId }) : undefined;

  return (
    cardQuery ||
    dashboardQuery ||
    collectionQuery ||
    tableQuery ||
    databaseQuery ||
    documentQuery
  );
};

export const MetabotSmartLinkNode = ({ node: { attrs } }: NodeViewProps) => (
  <NodeViewWrapper as="span">
    <MetabotSmartLinkComponent entityId={attrs.entityId} model={attrs.model} />
  </NodeViewWrapper>
);

MetabotSmartLinkNode.displayName = "MetabotSmartLinkNode";

export const MetabotSmartLinkComponent = ({
  model,
  entityId,
}: {
  model: SuggestionModel;
  entityId: string;
  selected?: boolean;
}) => {
  const {
    data: entity = undefined,
    isLoading = false,
    error = null,
  } = useEntityData(parseInt(entityId, 10), model) || {};
  const dispatch = useDispatch();

  // TODO: double check if we need this in our case...
  useEffect(() => {
    if (entity?.name) {
      dispatch(updateMentionsCache({ entityId, model, name: entity.name }));
    }
  }, [dispatch, entity?.name, entityId, model]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (entity) {
      const entityUrlableModel = entityToUrlableModel(entity, model);
      const entityUrl = modelToUrl(entityUrlableModel);

      if (entityUrl) {
        // Navigate within the same tab, keeping the metabot sidebar open
        dispatch(push(entityUrl));
      }
    }
  };

  if (isLoading) {
    return (
      <span className={styles.smartLink}>
        <span className={styles.smartLinkInner}>
          <Icon name="hourglass" className={styles.icon} />
          {t`Loading ${model}...`}
        </span>
      </span>
    );
  }

  if (error || !entity) {
    return (
      <span className={styles.smartLink}>
        <span className={styles.smartLinkInner}>
          <Icon name="warning" className={styles.icon} />
          {error ? t`Failed to load` : t`Unknown`} {model}
        </span>
      </span>
    );
  }

  const iconData = getIcon(entityToObjectWithModel(entity, model));

  return (
    <button type="button" onClick={handleClick} className={styles.smartLink}>
      <span className={styles.smartLinkInner}>
        <Icon name={iconData.name} className={styles.icon} />
        {entity.name}
      </span>
    </button>
  );
};

function entityToUrlableModel(
  entity: SmartLinkEntity,
  model: SuggestionModel | null,
): UrlableModel {
  const result: UrlableModel = {
    id: entity.id as number,
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
