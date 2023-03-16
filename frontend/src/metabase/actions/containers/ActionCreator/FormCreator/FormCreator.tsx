import React, { useState, useEffect, useMemo } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import ExternalLink from "metabase/core/components/ExternalLink";

import MetabaseSettings from "metabase/lib/settings";

import { ActionForm } from "metabase/actions/components/ActionForm";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import type { ActionFormSettings, Parameter } from "metabase-types/api";

import { getDefaultFormSettings, sortActionParams } from "../../../utils";
import { syncFieldsWithParameters } from "../utils";

import { EmptyFormPlaceholder } from "./EmptyFormPlaceholder";
import { FormContainer, InfoText } from "./FormCreator.styled";

interface FormCreatorProps {
  parameters: Parameter[];
  formSettings?: ActionFormSettings;
  isEditable: boolean;
  onChange: (formSettings: ActionFormSettings) => void;
}

function FormCreator({
  parameters,
  formSettings: passedFormSettings,
  isEditable,
  onChange,
}: FormCreatorProps) {
  const [formSettings, setFormSettings] = useState<ActionFormSettings>(
    passedFormSettings?.fields ? passedFormSettings : getDefaultFormSettings(),
  );

  useEffect(() => {
    onChange(formSettings);
  }, [formSettings, onChange]);

  useEffect(() => {
    // add default settings for new parameters
    if (formSettings && parameters) {
      setFormSettings(syncFieldsWithParameters(formSettings, parameters));
    }
  }, [parameters, formSettings]);

  const sortedParams = useMemo(
    () => parameters.sort(sortActionParams(formSettings)),
    [parameters, formSettings],
  );

  if (!sortedParams.length) {
    return (
      <SidebarContent>
        <FormContainer>
          <EmptyFormPlaceholder />
        </FormContainer>
      </SidebarContent>
    );
  }

  const docsLink = (
    <ExternalLink
      key="learn-more"
      href={MetabaseSettings.docsUrl("actions/custom")}
    >{t`Learn more`}</ExternalLink>
  );

  return (
    <SidebarContent title={t`Action parameters`}>
      <FormContainer>
        <InfoText>
          {jt`Configure your parameters' types and properties here. The values for these parameters can come from user input, or from a dashboard filter. ${docsLink}`}
        </InfoText>
        <ActionForm
          parameters={sortedParams}
          isEditable={isEditable}
          onClose={_.noop}
          onSubmit={_.noop}
          formSettings={formSettings}
          setFormSettings={setFormSettings}
        />
      </FormContainer>
    </SidebarContent>
  );
}

export default FormCreator;
