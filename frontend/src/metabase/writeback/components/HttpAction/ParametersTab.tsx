import React from "react";
import cx from "classnames";
import { t } from "ttag";
import { assoc, dissoc } from "icepick";
import Icon from "metabase/components/Icon";
import { recognizeTemplateTags } from "metabase-lib/lib/queries/NativeQuery";
import { Parameter } from "metabase-types/types/Parameter";

type Props = {
  body: string;
  headers: string;

  parameters: any;
  setParameters: (parameters: any) => void;
};

const ParametersTab: React.FC<Props> = ({
  body,
  headers,
  parameters,
  setParameters,
}) => {
  const params: Parameter[] = React.useMemo(() => {
    const allParams = new Set([
      ...recognizeTemplateTags(body),
      ...recognizeTemplateTags(headers),
    ]);
    const params = Object.entries(parameters || {}).map(
      ([key, value]) => value,
    ) as Parameter[];
    allParams.forEach(param => {
      if (!(param in params)) {
        // params.push({ name: param, value: "" });
      }
    });
    return params;
  }, [body, headers, parameters]);
  return (
    <div className="grid grid-cols-2">
      {params.map(({}, index) => {
        return <></>;
      })}
    </div>
  );
};

export default ParametersTab;
