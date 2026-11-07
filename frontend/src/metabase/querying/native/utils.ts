import slugg from "slugg";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { getTemplateTagParameter } from "metabase-lib/v1/parameters/utils/template-tags";
import type {
  Card,
  CardId,
  DatabaseId,
  NativeQuerySnippet,
  ParameterValuesConfig,
  TemplateTag,
} from "metabase-types/api";

function getTemplateTagList(query: Lib.Query): TemplateTag[] {
  return Object.values(Lib.templateTags(query));
}

export function getVariableTemplateTags(query: Lib.Query): TemplateTag[] {
  return getTemplateTagList(query).filter(Lib.isVariableTemplateTag);
}

export function hasSnippetTemplateTags(query: Lib.Query): boolean {
  return getTemplateTagList(query).some((tag) => tag.type === "snippet");
}

export function getTemplateTagCardIds(query: Lib.Query): CardId[] {
  return getTemplateTagList(query).flatMap((tag) =>
    tag.type === "card" && tag["card-id"] != null ? [tag["card-id"]] : [],
  );
}

export function requiresNativeCollection(query: Lib.Query): boolean {
  return Lib.engine(query) === "mongo";
}

export function setNativeQueryDatabaseId(
  query: Lib.Query,
  databaseId: DatabaseId,
  metadata: Metadata,
): Lib.Query {
  if (Lib.databaseID(query) === databaseId) {
    return query;
  }
  const newQuery = Lib.withDifferentDatabase(
    query,
    databaseId,
    Lib.metadataProvider(databaseId, metadata),
  );
  const [defaultTable] = metadata.database(databaseId)?.tables ?? [];
  return requiresNativeCollection(newQuery) && defaultTable != null
    ? Lib.withNativeExtras(newQuery, { collection: defaultTable.name })
    : newQuery;
}

export function setTemplateTag(query: Lib.Query, tag: TemplateTag): Lib.Query {
  return Lib.withTemplateTags(query, {
    ...Lib.templateTags(query),
    [tag.name]: tag,
  });
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
  const tags = getTemplateTagList(query);
  const snippetTags = tags.filter((tag) => tag.type === "snippet");
  const otherTags = tags.filter((tag) => tag.type !== "snippet");
  const oldIndex = otherTags.findIndex((tag) => tag.id === tagId);
  const reorderedTags = [...otherTags];
  reorderedTags.splice(newIndex, 0, reorderedTags.splice(oldIndex, 1)[0]);

  return Lib.withTemplateTags(
    query,
    Object.fromEntries(
      [...snippetTags, ...reorderedTags].map((tag) => [tag.name, tag]),
    ),
  );
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
    getTemplateTagList(query).flatMap((tag) => {
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
    getTemplateTagList(query).flatMap((tag) => {
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
