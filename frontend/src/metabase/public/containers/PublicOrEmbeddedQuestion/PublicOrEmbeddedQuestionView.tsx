import cx from "classnames";
import { updateIn } from "icepick";
import type { Dispatch, SetStateAction } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { EmbedFrame } from "metabase/public/components/EmbedFrame";
import type { DisplayTheme } from "metabase/public/lib/types";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import Visualization from "metabase/visualizations/components/Visualization";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Card,
  VisualizationSettings,
  Dataset,
  ParameterId,
  ParameterValuesMap,
  DatasetQuery,
} from "metabase-types/api";

export function PublicOrEmbeddedQuestionView({
  card,
  metadata,
  result,
  uuid,
  token,
  getParameters,
  parameterValues,
  setParameterValue,
  setParameterValueToDefault,
  bordered,
  hide_download_button,
  hide_parameters,
  theme,
  titled,
  setCard,
}: {
  initialized: boolean;
  card: Card<DatasetQuery> | null;
  metadata: Metadata;
  result: Dataset | null;
  uuid: string;
  token: string;
  getParameters: () => UiParameter[];
  parameterValues: ParameterValuesMap;
  setParameterValue: (parameterId: ParameterId, value: any) => Promise<void>;
  setParameterValueToDefault: (parameterId: ParameterId) => void;
  bordered: boolean;
  hide_download_button?: boolean;
  hide_parameters?: string;
  theme?: DisplayTheme;
  titled: boolean;
  setCard: Dispatch<SetStateAction<Card<DatasetQuery> | null>>;
}) {
  const question = new Question(card, metadata);
  const actionButtons = result && (
    <QueryDownloadWidget
      className={cx(CS.m1, CS.textMediumHover)}
      question={question}
      result={result}
      uuid={uuid}
      token={token}
    />
  );

  return (
    <EmbedFrame
      name={card && card.name}
      description={card && card.description}
      actionButtons={actionButtons}
      question={question}
      parameters={getParameters()}
      parameterValues={parameterValues}
      setParameterValue={setParameterValue}
      enableParameterRequiredBehavior
      setParameterValueToDefault={setParameterValueToDefault}
      bordered={bordered}
      hide_download_button={hide_download_button}
      hide_parameters={hide_parameters}
      theme={theme}
      titled={titled}
    >
      <LoadingAndErrorWrapper
        className={CS.flexFull}
        loading={!result}
        error={typeof result === "string" ? result : null}
        noWrapper
      >
        {() => (
          <Visualization
            error={result && result.error}
            rawSeries={[{ card: card, data: result && result.data }]}
            className={cx(CS.full, CS.flexFull, CS.z1)}
            onUpdateVisualizationSettings={(
              settings: VisualizationSettings,
            ) => {
              setCard(prevCard =>
                updateIn(
                  prevCard,
                  ["visualization_settings"],
                  previousSettings => ({ ...previousSettings, ...settings }),
                ),
              );
            }}
            gridUnit={12}
            showTitle={false}
            isDashboard
            mode={PublicMode}
            metadata={metadata}
            onChangeCardAndRun={() => {}}
          />
        )}
      </LoadingAndErrorWrapper>
    </EmbedFrame>
  );
}
