import { useEffect, useMemo, useState } from "react";

import { getDashcardData, getParameters } from "metabase/dashboard/selectors";
import { isQuestionDashCard } from "metabase/dashboard/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { GTAPApi } from "metabase/services";
import Question from "metabase-lib/v1/Question";
import {
  getTargetsForDashboard,
  getTargetsForQuestion,
} from "metabase-lib/v1/parameters/utils/click-behavior";
import type { DatasetColumn, Parameter } from "metabase-types/api";

import type { ClickMappingsOwnProps, TargetItem } from "./types";
import { isMappableColumn } from "./utils";

type ClickMappingsData = {
  setTargets: TargetItem[];
  unsetTargets: TargetItem[];
  sourceOptions: {
    column: DatasetColumn[];
    parameter: Parameter[];
  };
  question: Question;
};

export function useClickMappingsData(
  props: ClickMappingsOwnProps,
): ClickMappingsData {
  const { object, isDashboard, dashcard, clickBehavior } = props;

  const parameters = useSelector(getParameters);
  const metadata = useSelector(getMetadata);
  const dashcardData = useSelector((state) =>
    getDashcardData(state, dashcard.id),
  );

  return useMemo(() => {
    const question = new Question(dashcard.card, metadata);

    let filteredParameters = parameters;

    if (props.excludeParametersSources) {
      const parameterMapping =
        "parameterMapping" in clickBehavior
          ? (clickBehavior.parameterMapping ?? {})
          : {};

      const parametersUsedAsSources = Object.values(parameterMapping)
        .filter((mapping) => mapping.source.type === "parameter")
        .map((mapping) => mapping.source.id);

      filteredParameters = parameters.filter((parameter) =>
        parametersUsedAsSources.includes(parameter.id),
      );
    }

    const isTargetSet = ({ id }: { id: string }) =>
      "parameterMapping" in clickBehavior &&
      clickBehavior.parameterMapping?.[id]?.source != null;

    const isQuestionTarget = object instanceof Question;
    const isDashboardTarget =
      isDashboard && object && isQuestionDashCard(dashcard);

    const targets = isQuestionTarget
      ? getTargetsForQuestion(object)
      : isDashboardTarget
        ? getTargetsForDashboard(object, dashcard)
        : [];

    const setTargets = targets.filter(isTargetSet);
    const unsetTargets = targets.filter((t) => !isTargetSet(t));

    const availableColumns: DatasetColumn[] = Object.values(
      dashcardData ?? {},
    ).flatMap((dataset) => dataset?.data?.cols ?? []);

    const sourceOptions = {
      column: availableColumns.filter(isMappableColumn),
      parameter: filteredParameters,
    };

    return { setTargets, unsetTargets, sourceOptions, question };
  }, [
    clickBehavior,
    dashcard,
    dashcardData,
    isDashboard,
    metadata,
    object,
    parameters,
    props.excludeParametersSources,
  ]);
}

export function useLoadQuestionMetadata(question: Question | null | undefined) {
  const dispatch = useDispatch();

  useEffect(() => {
    if (question instanceof Question) {
      dispatch(loadMetadataForCard(question.card()));
    }
  }, [question, dispatch]);
}

export function useUserAttributes(): string[] {
  const [userAttributes, setUserAttributes] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadUserAttributes = async () => {
      if (MetabaseSettings.sandboxingEnabled()) {
        const attributes = await GTAPApi.attributes();
        if (isMounted) {
          setUserAttributes(attributes);
        }
      }
    };

    loadUserAttributes();

    return () => {
      isMounted = false;
    };
  }, []);

  return userAttributes;
}
