import _ from "underscore";

import type { EmbeddingParameterVisibility } from "metabase/public/lib/types";
import type Database from "metabase-lib/v1/metadata/Database";
import type Field from "metabase-lib/v1/metadata/Field";
import type {
  Parameter,
  ParameterId,
  RowValue,
  TemplateTag,
  TemplateTagId,
} from "metabase-types/api";

import { TagEditorParam } from "../TagEditorParam";

interface SettingsPaneProps {
  tags: TemplateTag[];
  database?: Database | null;
  databases: Database[];
  databaseFields: Field[];
  parametersById: Record<ParameterId, Parameter>;
  setTemplateTag: (tag: TemplateTag) => void;
  setTemplateTagConfig: (tag: TemplateTag, config: Parameter) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  getEmbeddedParameterVisibility: GetEmbeddedParamVisibility;
}

type GetEmbeddedParamVisibility = (
  slug: string,
) => EmbeddingParameterVisibility;

export const SettingsPane = ({
  tags,
  parametersById,
  databaseFields,
  database,
  databases,
  setTemplateTag,
  setTemplateTagConfig,
  setParameterValue,
  getEmbeddedParameterVisibility,
}: SettingsPaneProps) => (
  <div>
    {tags.map(tag => (
      <div key={tag.id}>
        <TagEditorParam
          tag={tag}
          key={tag.name}
          parameter={parametersById[tag.id]}
          embeddedParameterVisibility={
            parametersById[tag.id]
              ? getEmbeddedParameterVisibility(parametersById[tag.id].slug)
              : null
          }
          databaseFields={databaseFields}
          database={database}
          databases={databases}
          setTemplateTag={setTemplateTag}
          setTemplateTagConfig={setTemplateTagConfig}
          setParameterValue={setParameterValue}
        />
      </div>
    ))}
  </div>
);
