import slugg from "slugg";

import * as Lib from "metabase-lib";
import type { JsMetadata } from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getTemplateTagParameter } from "metabase-lib/v1/parameters/utils/template-tags";
import type {
  Card,
  CardId,
  DatabaseId,
  NativeQuerySnippet,
  ParameterValuesConfig,
  Table,
  TemplateTag,
} from "metabase-types/api";

export function getVariableTemplateTags(query: Lib.Query): TemplateTag[] {
  return Lib.templateTags(query).filter(Lib.isVariableTemplateTag);
}

export function hasSnippetTemplateTags(query: Lib.Query): boolean {
  return Lib.templateTags(query).some((tag) => tag.type === "snippet");
}

export function getTemplateTagCardIds(query: Lib.Query): CardId[] {
  return Lib.templateTags(query).flatMap((tag) =>
    tag.type === "card" && tag["card-id"] != null ? [tag["card-id"]] : [],
  );
}

export function requiresNativeCollection(query: Lib.Query): boolean {
  return Lib.engine(query) === "mongo";
}

export function setNativeQueryDatabaseId(
  query: Lib.Query,
  databaseId: DatabaseId,
  metadata: JsMetadata,
): Lib.Query {
  if (Lib.databaseID(query) === databaseId) {
    return query;
  }
  return Lib.withDifferentDatabase(
    query,
    databaseId,
    Lib.metadataProvider(databaseId, metadata),
  );
}

export function setNativeQueryDefaultCollection(
  query: Lib.Query,
  tables: Table[],
): Lib.Query {
  const [defaultTable] = tables;
  if (!requiresNativeCollection(query) || defaultTable == null) {
    return query;
  }
  return Lib.withNativeExtras(query, { collection: defaultTable.name });
}

export function setTemplateTag(query: Lib.Query, tag: TemplateTag): Lib.Query {
  return Lib.withTemplateTags(
    query,
    Lib.templateTags(query).map((oldTag) =>
      oldTag.name === tag.name ? tag : oldTag,
    ),
  );
}

export function setTemplateTagConfig(
  question: Question,
  tag: TemplateTag,
  config: ParameterValuesConfig,
): Question {
  const oldParameter = question
    .parameters()
    .find((parameter) => parameter.id === tag.id);
  const newParameter = getTemplateTagParameter(tag, {
    ...oldParameter,
    ...config,
  });
  return question.setParameter(tag.id, newParameter);
}

export function setTemplateTagIndex(
  query: Lib.Query,
  tagId: TemplateTag["id"],
  newIndex: number,
): Lib.Query {
  const tags = Lib.templateTags(query);
  const snippetTags = tags.filter((tag) => tag.type === "snippet");
  const otherTags = tags.filter((tag) => tag.type !== "snippet");
  const oldIndex = otherTags.findIndex((tag) => tag.id === tagId);
  const reorderedTags = [...otherTags];
  reorderedTags.splice(newIndex, 0, reorderedTags.splice(oldIndex, 1)[0]);

  return Lib.withTemplateTags(query, [...snippetTags, ...reorderedTags]);
}

function getTagRegex(tagName: string): RegExp {
  return new RegExp(`{{\\s*${tagName}\\s*}}`, "g");
}

function replaceTagNames(
  query: Lib.Query,
  replacements: { oldName: string; newName: string }[],
): Lib.Query {
  const queryText = Lib.rawNativeQuery(query);
  const newQueryText = replacements.reduce(
    (text, { oldName, newName }) =>
      text.replace(getTagRegex(oldName), `{{${newName}}}`),
    queryText,
  );
  return newQueryText !== queryText
    ? Lib.withNativeQuery(query, newQueryText)
    : query;
}

export function updateSnippetNames(
  query: Lib.Query,
  snippets: NativeQuerySnippet[],
): Lib.Query {
  const snippetsById = new Map(
    snippets.map((snippet) => [snippet.id, snippet]),
  );
  return replaceTagNames(
    query,
    Lib.templateTags(query).flatMap((tag) => {
      const snippet =
        tag.type === "snippet" && tag["snippet-id"] != null
          ? snippetsById.get(tag["snippet-id"])
          : undefined;
      return snippet != null && tag["snippet-name"] !== snippet.name
        ? [{ oldName: tag.name, newName: `snippet: ${snippet.name}` }]
        : [];
    }),
  );
}

export function updateCardTemplateTagNames(
  query: Lib.Query,
  cards: Card[],
): Lib.Query {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return replaceTagNames(
    query,
    Lib.templateTags(query).flatMap((tag) => {
      const card =
        tag.type === "card" && tag["card-id"] != null
          ? cardsById.get(tag["card-id"])
          : undefined;
      return card != null
        ? [{ oldName: tag.name, newName: `#${card.id}-${slugg(card.name)}` }]
        : [];
    }),
  );
}
