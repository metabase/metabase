import cx from "classnames";
import { updateIn } from "icepick";
import type { Dispatch, SetStateAction } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { EmbedFrame } from "metabase/public/components/EmbedFrame";
import type {
  DisplayTheme,
  EmbedResourceDownloadOptions,
} from "metabase/public/lib/types";
import { PublicOrEmbeddedQuestionDownloadPopover } from "metabase/query_builder/components/QuestionDownloadPopover/QuestionDownloadPopover";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import Visualization from "metabase/visualizations/components/Visualization";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Card,
  Dataset,
  ParameterId,
  ParameterValuesMap,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

export interface PublicOrEmbeddedQuestionViewProps {
  initialized: boolean;
  card: Card | null;
  metadata: Metadata;
  result: Dataset | null;
  getParameters: () => UiParameter[];
  parameterValues: ParameterValuesMap;
  setParameterValue: (parameterId: ParameterId, value: any) => Promise<void>;
  setParameterValueToDefault: (parameterId: ParameterId) => void;
  bordered: boolean;
  hide_parameters: string | null;
  theme: DisplayTheme | undefined;
  titled: boolean;
  setCard: Dispatch<SetStateAction<Card | null>>;
  downloadsEnabled: EmbedResourceDownloadOptions;
}

export function PublicOrEmbeddedQuestionView({
  card,
  metadata,
  result,
  getParameters,
  parameterValues,
  setParameterValue,
  setParameterValueToDefault,
  bordered,
  hide_parameters,
  theme,
  titled,
  setCard,
  downloadsEnabled,
}: PublicOrEmbeddedQuestionViewProps) {
  const question = new Question(card, metadata);

  const isTable = question.display() === "table";
  const downloadInFooter = !titled && isTable;

  const questionResultDownloadButton =
    result && downloadsEnabled.results ? (
      <PublicOrEmbeddedQuestionDownloadPopover
        className={cx(
          CS.m1,
          !downloadInFooter && CS.textMediumHover,
          !downloadInFooter && CS.hoverChild,
          !downloadInFooter && CS.hoverChildSmooth,
        )}
        question={question}
        result={result}
        floating={!titled && !isTable}
      />
    ) : null;

  const untranslatedRawSeries = [{ card, data: result?.data }] as RawSeries;
  const rawSeries = PLUGIN_CONTENT_TRANSLATION.useTranslateSeries(
    untranslatedRawSeries,
  );

  return (
    <EmbedFrame
      name={card && card.name}
      description={card && card.description}
      question={question}
      parameters={getParameters()}
      parameterValues={parameterValues}
      setParameterValue={setParameterValue}
      enableParameterRequiredBehavior
      setParameterValueToDefault={setParameterValueToDefault}
      // We don't support background: false on questions (metabase#43838)
      background
      bordered={bordered}
      hide_parameters={hide_parameters}
      theme={theme}
      titled={titled}
      headerButtons={downloadInFooter ? null : questionResultDownloadButton}
      // We don't support PDF downloads on questions
      pdfDownloadsEnabled={false}
    >
      <LoadingAndErrorWrapper
        className={CS.flexFull}
        loading={!result}
        error={typeof result === "string" ? result : null}
        noWrapper
      >
        {() => (
          <Visualization
            error={result?.error?.toString()}
            rawSeries={rawSeries}
            className={cx(CS.full, CS.flexFull, CS.z1)}
            onUpdateVisualizationSettings={(
              settings: VisualizationSettings,
            ) => {
              setCard((prevCard) =>
                updateIn(
                  prevCard,
                  ["visualization_settings"],
                  (previousSettings) => ({ ...previousSettings, ...settings }),
                ),
              );
            }}
            gridUnit={12}
            showTitle={false}
            mode={PublicMode}
            // Why do we need `isDashboard` when this is a standalone question?
            // `isDashboard` is used by Visualization to change some visual behaviors
            // including the "No results" message
            isDashboard
            metadata={metadata}
            onChangeCardAndRun={() => {}}
            tableFooterExtraButtons={
              downloadInFooter ? questionResultDownloadButton : null
            }
          />
        )}
      </LoadingAndErrorWrapper>
    </EmbedFrame>
  );
}
