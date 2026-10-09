import { useMemo } from "react";
import { t } from "ttag";

import {
  getDefaultFormSettings,
  sortActionParams,
} from "metabase/actions/utils";
import { useUpdateActionMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import * as Lib from "metabase-lib";
import type {
  ActionFormSettings,
  FieldSettings,
  UpdateActionRequest,
  WritebackParameter,
  WritebackQueryAction,
} from "metabase-types/api";

import { useActionQuery } from "../../components/ActionEditor/hooks";
import {
  getFieldSettingsFromQuery,
  getQueryParameters,
  setTemplateTagFieldType,
} from "../../utils";

export type ActionField = {
  parameter: WritebackParameter;
  settings: FieldSettings;
  variableName: string;
};

type ActionFieldsResult = {
  fields: ActionField[];
  updateField: (
    fieldId: string,
    patch: Partial<FieldSettings>,
  ) => Promise<void>;
  reorderFields: (fieldIds: string[]) => Promise<void>;
};

export function useActionFields(
  action: WritebackQueryAction,
): ActionFieldsResult {
  const query = useActionQuery(action.dataset_query);
  const [updateAction] = useUpdateActionMutation();
  const { sendErrorToast } = useMetadataToasts();

  const formSettings = useMemo(
    () =>
      getFieldSettingsFromQuery(
        query,
        getDefaultFormSettings(action.visualization_settings),
      ),
    [query, action.visualization_settings],
  );

  const fields = useMemo(() => {
    const tags = Object.values(Lib.templateTags(query));
    return [...getQueryParameters(query)]
      .sort(sortActionParams(formSettings))
      .flatMap((parameter) => {
        const settings = formSettings.fields?.[parameter.id];
        const tag = tags.find((tag) => tag.id === parameter.id);
        return settings && tag
          ? [{ parameter, settings, variableName: tag.name }]
          : [];
      });
  }, [query, formSettings]);

  const save = async (request: Omit<UpdateActionRequest, "id">) => {
    const { error } = await updateAction({ id: action.id, ...request });
    if (error) {
      sendErrorToast(t`Failed to update action fields`);
    }
  };

  const withFields = (
    update: (
      fields: Record<string, FieldSettings>,
    ) => Record<string, FieldSettings>,
  ): ActionFormSettings => ({
    ...formSettings,
    fields: update(formSettings.fields ?? {}),
  });

  const updateField = async (
    fieldId: string,
    patch: Partial<FieldSettings>,
  ) => {
    const field = formSettings.fields?.[fieldId];
    if (field == null) {
      return;
    }
    const visualizationSettings = withFields((fields) => ({
      ...fields,
      [fieldId]: { ...field, ...patch },
    }));

    if (patch.fieldType != null && patch.fieldType !== field.fieldType) {
      const nextQuery = setTemplateTagFieldType(
        query,
        fieldId,
        patch.fieldType,
      );
      await save({
        dataset_query: Lib.toJsQuery(nextQuery),
        parameters: getQueryParameters(nextQuery),
        visualization_settings: visualizationSettings,
      });
    } else {
      await save({ visualization_settings: visualizationSettings });
    }
  };

  const reorderFields = async (fieldIds: string[]) => {
    await save({
      visualization_settings: withFields((fields) =>
        Object.fromEntries(
          Object.entries(fields).map(([id, field]) => [
            id,
            { ...field, order: fieldIds.indexOf(id) },
          ]),
        ),
      ),
    });
  };

  return { fields, updateField, reorderFields };
}
