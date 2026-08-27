import { useEffect } from "react";

type Options = {
  initialParameters: unknown;
  parameters: unknown;
} & (
  | {
      initialParameterPropName: "initialParameters";
      parameterPropName: "parameters";
    }
  | {
      initialParameterPropName: "initialSqlParameters";
      parameterPropName: "sqlParameters";
    }
);

export const useWarnConflictingParameterProps = ({
  initialParameters,
  parameters,
  initialParameterPropName,
  parameterPropName,
}: Options) => {
  const hasConflict =
    initialParameters !== undefined && parameters !== undefined;

  useEffect(() => {
    if (hasConflict) {
      console.warn(
        `\`${initialParameterPropName}\` is ignored when \`${parameterPropName}\` is set. Pass only one.`,
      );
    }
  }, [hasConflict, initialParameterPropName, parameterPropName]);
};
