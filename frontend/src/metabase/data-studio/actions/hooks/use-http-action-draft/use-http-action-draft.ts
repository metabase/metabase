import { useMemo, useState } from "react";
import _ from "underscore";

import { getDefaultFormSettings } from "metabase/actions/utils";
import type {
  ActionFormSettings,
  WritebackParameter,
} from "metabase-types/api";

import {
  type HttpActionDefinition,
  type HttpActionRequest,
  getHttpActionDefinition,
} from "../../utils";

type UseHttpActionDraftOptions = {
  initialRequest: HttpActionRequest;
  parameters?: WritebackParameter[];
  formSettings?: ActionFormSettings;
};

type HttpActionDraft = {
  request: HttpActionRequest;
  definition: HttpActionDefinition | null;
  isDirty: boolean;
  isValid: boolean;
  setRequest: (request: HttpActionRequest) => void;
};

export function useHttpActionDraft({
  initialRequest,
  parameters,
  formSettings,
}: UseHttpActionDraftOptions): HttpActionDraft {
  const [request, setRequest] = useState(initialRequest);

  const definition = useMemo(
    () =>
      getHttpActionDefinition(
        request,
        parameters ?? [],
        getDefaultFormSettings(formSettings),
      ),
    [request, parameters, formSettings],
  );
  const isDirty = !_.isEqual(request, initialRequest);
  const isValid = definition != null;

  return { request, definition, isDirty, isValid, setRequest };
}
