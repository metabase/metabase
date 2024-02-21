import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import { Select } from "metabase/ui";
import type { TemplateTag } from "metabase-types/api";

import {
  ContainerLabel,
  ErrorSpan,
  InputContainer,
} from "./TagEditorParam.styled";

export function FilterWidgetTypeSelect({
  tag,
  value,
  onChange,
  options,
}: {
  tag: TemplateTag;
  value: string;
  onChange: (widgetType: string) => void;
  options: { name?: string; type: string }[];
}) {
  const hasOptions = options.length > 0;
  const hasNoWidgetType = tag["widget-type"] === "none" || !tag["widget-type"];

  const optionsOrDefault = useMemo(
    () =>
      (hasOptions ? options : [{ name: t`None`, type: "none" }]).map(
        option => ({
          label: option.name,
          value: option.type,
        }),
      ),
    [hasOptions, options],
  );

  return (
    <InputContainer>
      <ContainerLabel smallPaddingBottom>
        {t`Filter widget type`}
        {hasNoWidgetType && <ErrorSpan>({t`required`})</ErrorSpan>}
      </ContainerLabel>

      <Select
        value={value}
        onChange={onChange}
        placeholder={t`Select…`}
        data={optionsOrDefault}
        data-testid="filter-widget-type-select"
      />

      {!hasOptions && (
        <p>
          {t`There aren't any filter widgets for this type of field yet.`}{" "}
          <Link
            // eslint-disable-next-line no-unconditional-metabase-links-render -- It's hard to tell if this is still used in the app. Please see https://metaboat.slack.com/archives/C505ZNNH4/p1703243785315819
            to={MetabaseSettings.docsUrl(
              "questions/native-editor/sql-parameters",
              "the-field-filter-variable-type",
            )}
            target="_blank"
            className="link"
          >
            {t`Learn more`}
          </Link>
        </p>
      )}
    </InputContainer>
  );
}
