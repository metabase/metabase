import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  ActionFormSettings,
  Card,
  FieldType,
  InputSettingType,
  NativeDatasetQuery,
  Parameter,
  ParameterType,
  TemplateTag,
  TemplateTagType,
  VisualizationSettings,
  WritebackQueryAction,
} from "metabase-types/api";

type FieldTypeMap = Record<string, ParameterType>;
type TagTypeMap = Record<string, TemplateTagType>;

const fieldTypeToParameterTypeMap: FieldTypeMap = {
  string: "string/=",
  number: "number/=",
};

const dateTypeToParameterTypeMap: FieldTypeMap = {
  date: "date/single",
  datetime: "date/single",
  monthyear: "date/month-year",
  quarteryear: "date/quarter-year",
};

const fieldTypeToTagTypeMap: TagTypeMap = {
  string: "text",
  number: "number",
  date: "date",
};

const getTagTypeFromFieldSettings = (fieldType: FieldType): TemplateTagType => {
  return fieldTypeToTagTypeMap[fieldType] ?? "text";
};

const getParameterTypeFromFieldSettings = (
  fieldType: FieldType,
  inputType: InputSettingType,
): ParameterType => {
  if (fieldType === "date") {
    return dateTypeToParameterTypeMap[inputType] ?? "date/single";
  }

  return fieldTypeToParameterTypeMap[fieldType] ?? "string/=";
};

export const setTemplateTagTypesFromFieldSettings = (
  question: Question,
  settings: ActionFormSettings,
): Question => {
  const fields = settings.fields || {};
  // Unjustified type cast. FIXME
  const query = question.legacyNativeQuery() as NativeQuery;
  let tempQuestion = question.clone();

  query.variableTemplateTags().forEach((tag: TemplateTag) => {
    // Unjustified type cast. FIXME
    const currentQuery = tempQuestion.legacyNativeQuery() as NativeQuery;
    const fieldType = fields[tag.id]?.fieldType ?? "string";
    const nextTag = {
      ...tag,
      type: getTagTypeFromFieldSettings(fieldType),
    };
    tempQuestion = tempQuestion.setLegacyQuery(
      currentQuery.setTemplateTag(tag.name, nextTag),
    );
  });

  return tempQuestion;
};

export const setParameterTypesFromFieldSettings = (
  settings: ActionFormSettings,
  parameters: Parameter[],
): Parameter[] => {
  const fields = settings.fields || {};
  return parameters.map((parameter) => {
    const field = fields[parameter.id];
    return {
      ...parameter,
      type: field
        ? getParameterTypeFromFieldSettings(field.fieldType, field.inputType)
        : "string/=",
    };
  });
};

export function convertActionToQuestionCard(
  action: WritebackQueryAction,
): Card<NativeDatasetQuery> {
  return {
    id: action.id,
    worktree_id: null,
    entity_id: action.entity_id,
    created_at: action.created_at,
    updated_at: action.updated_at,
    name: action.name,
    description: action.description,
    dataset_query: action.dataset_query,
    display: "action",
    visualization_settings:
      // Unjustified type cast. FIXME
      action.visualization_settings as VisualizationSettings,
    type: "question",
    can_write: true,
    can_restore: false,
    can_delete: false,
    public_uuid: null,
    collection_id: null,
    collection_position: null,
    dashboard: null,
    result_metadata: [],
    cache_ttl: null,
    last_query_start: null,
    average_query_time: null,
    archived: false,
    enable_embedding: false,
    embedding_params: null,
    initially_published_at: null,
    can_manage_db: true,
    dashboard_count: null,
    dashboard_id: null,
  };
}
