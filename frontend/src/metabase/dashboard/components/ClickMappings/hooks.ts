import { useEffect, useMemo } from "react";

import { skipToken, useListUserAttributesQuery } from "metabase/api";
import { getDashcardData, getParameters } from "metabase/dashboard/selectors";
import {
  getTargetsForDashboard,
  getTargetsForQuestion,
} from "metabase/parameters/utils/click-behavior";
import { loadMetadataForCard } from "metabase/questions/actions";
import { useDispatch, useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import MetabaseSettings from "metabase/utils/settings";
import Question from "metabase-lib/v1/Question";
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
  const { data: userAttributes } = useListUserAttributesQuery(
    MetabaseSettings.sandboxingEnabled() ? undefined : skipToken,
  );

  return userAttributes ?? [];
}
