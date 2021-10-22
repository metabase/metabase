import Question from "metabase-lib/lib/Question";

import { ExpressionDimension } from "metabase-lib/lib/Dimension";

import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type { Card } from "metabase-types/types/Card";
import type {
  Parameter,
  ParameterMappingUIOption,
} from "metabase-types/types/Parameter";

import {
  dimensionFilterForParameter,
  getTagOperatorFilterForParameter,
  variableFilterForParameter,
} from "./filters";

export function getParameterMappingOptions(
  metadata: Metadata,
  parameter: ?Parameter = null,
  card: Card,
): ParameterMappingUIOption[] {
  const options = [];
  if (card.display === "text") {
    // text cards don't have parameters
    return [];
  }

  const question = new Question(card, metadata);
  const query = question.query();

  if (question.isStructured()) {
    options.push(
      ...query
        .dimensionOptions(
          parameter ? dimensionFilterForParameter(parameter) : undefined,
        )
        .sections()
        .flatMap(section =>
          section.items.map(({ dimension }) => ({
            sectionName: section.name,
            name: dimension.displayName(),
            icon: dimension.icon(),
            target: ["dimension", dimension.mbql()],
            // these methods don't exist on instances of ExpressionDimension
            isForeign: !!(dimension instanceof ExpressionDimension
              ? false
              : dimension.fk() || dimension.joinAlias()),
          })),
        ),
    );
  } else {
    options.push(
      ...query
        .variables(
          parameter ? variableFilterForParameter(parameter) : undefined,
        )
        .map(variable => ({
          name: variable.displayName(),
          icon: variable.icon(),
          isForeign: false,
          target: ["variable", variable.mbql()],
        })),
    );
    options.push(
      ...query
        .dimensionOptions(
          parameter ? dimensionFilterForParameter(parameter) : undefined,
          parameter ? getTagOperatorFilterForParameter(parameter) : undefined,
        )
        .sections()
        .flatMap(section =>
          section.items.map(({ dimension }) => ({
            name: dimension.displayName(),
            icon: dimension.icon(),
            isForeign: false,
            target: ["dimension", dimension.mbql()],
          })),
        ),
    );
  }

  return options;
}
