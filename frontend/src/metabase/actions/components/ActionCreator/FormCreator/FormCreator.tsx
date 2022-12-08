import React, { useState, useEffect, useMemo } from "react";

import _ from "underscore";
import type { Parameter } from "metabase-types/types/Parameter";
import type { ActionFormSettings } from "metabase-types/api";

import { ActionForm } from "metabase/actions/components/ActionForm";

import { addMissingSettings } from "metabase/entities/actions/utils";
import { sortActionParams } from "metabase/actions/utils";

import { getDefaultFormSettings, hasNewParams } from "./utils";

import { EmptyFormPlaceholder } from "./EmptyFormPlaceholder";

import { FormCreatorWrapper } from "./FormCreator.styled";

export function FormCreator({
  params,
  formSettings: passedFormSettings,
  onChange,
  onExampleClick,
}: {
  params: Parameter[];
  formSettings?: ActionFormSettings;
  onChange: (formSettings: ActionFormSettings) => void;
  onExampleClick: () => void;
}) {
  const [formSettings, setFormSettings] = useState<ActionFormSettings>(
    passedFormSettings?.fields ? passedFormSettings : getDefaultFormSettings(),
  );

  useEffect(() => {
    onChange(formSettings);
  }, [formSettings, onChange]);

  useEffect(() => {
    // add default settings for new parameters
    if (formSettings && params && hasNewParams(params, formSettings)) {
      setFormSettings(addMissingSettings(formSettings, params));
    }
  }, [params, formSettings]);

  const sortedParams = useMemo(
    () => params.sort(sortActionParams(formSettings)),
    [params, formSettings],
  );

  if (!sortedParams.length) {
    return (
      <FormCreatorWrapper>
        <EmptyFormPlaceholder onExampleClick={onExampleClick} />
      </FormCreatorWrapper>
    );
  }

  return (
    <FormCreatorWrapper>
      <ActionForm
        parameters={sortedParams}
        initialValues={[]}
        onClose={_.noop}
        onSubmit={_.noop}
        formSettings={formSettings}
        setFormSettings={setFormSettings}
      />
    </FormCreatorWrapper>
  );
}
