import React, { useState, useEffect, useMemo } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import ExternalLink from "metabase/core/components/ExternalLink";
import { ActionForm } from "metabase/actions/components/ActionForm";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import MetabaseSettings from "metabase/lib/settings";

import type { ActionFormSettings, Parameter } from "metabase-types/api";

import { getDefaultFormSettings, sortActionParams } from "../../../utils";
import { addMissingSettings } from "../utils";
import { hasNewParams } from "./utils";

import { EmptyFormPlaceholder } from "./EmptyFormPlaceholder";
import { FormContainer, InfoText } from "./FormCreator.styled";

function FormCreator({
  params,
  isEditable,
  formSettings: passedFormSettings,
  onChange,
}: {
  params: Parameter[];
  isEditable: boolean;
  formSettings?: ActionFormSettings;
  onChange: (formSettings: ActionFormSettings) => void;
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
