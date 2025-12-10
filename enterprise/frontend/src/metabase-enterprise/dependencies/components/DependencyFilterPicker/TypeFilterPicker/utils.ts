import { t } from "ttag";

import type {
  CardType,
  DependencyGroupType,
  DependencyType,
} from "metabase-types/api";

import { getCardType, getDependencyType } from "../../../utils";

export function getDependencyTypes(
  groupTypes: DependencyGroupType[],
): DependencyType[] {
  const types = groupTypes.map(getDependencyType);
  return Array.from(new Set(types));
}

export function getCardTypes(groupTypes: DependencyGroupType[]): CardType[] {
  const cardTypes = groupTypes
    .map(getCardType)
    .filter((cardType) => cardType !== null);
  return Array.from(new Set(cardTypes));
}

export function getDependencyGroupTypes(
  types: DependencyType[],
  cardTypes: CardType[],
): DependencyGroupType[] {
  const groupTypes = [
    ...types.filter((type) => type !== "card"),
    ...(types.includes("card") ? cardTypes : []),
  ];
  return Array.from(new Set(groupTypes));
}

export function getDependencyGroupOptions(
  availableGroupTypes: DependencyGroupType[],
) {
  const labelByValue: Record<DependencyGroupType, string> = {
    question: t`Question`,
    model: t`Model`,
    metric: t`Metric`,
    table: t`Table`,
    transform: t`Transform`,
    snippet: t`Snippet`,
    dashboard: t`Dashboard`,
    document: t`Document`,
    sandbox: t`Sandbox`,
    segment: t`Segment`,
  };

  return availableGroupTypes.map((value) => ({
    value,
    label: labelByValue[value],
  }));
}
