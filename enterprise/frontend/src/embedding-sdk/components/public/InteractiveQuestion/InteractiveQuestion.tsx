import { InteractiveQuestionResult } from "embedding-sdk/components/private/InteractiveQuestionResult";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { InteractiveQuestionProvider } from "embedding-sdk/components/public/InteractiveQuestion/context";
import type { SdkClickActionPluginsConfig } from "embedding-sdk/lib/plugins";
import type { CardId } from "metabase-types/api";

interface InteractiveQuestionProps {
  questionId: CardId;
  withResetButton?: boolean;
  withTitle?: boolean;
  customTitle?: React.ReactNode;
  plugins?: SdkClickActionPluginsConfig;
  height?: string | number;
}

export const _InteractiveQuestion = ({
  questionId,
  withResetButton = true,
  withTitle = false,
  customTitle,
  plugins,
  height,
}: InteractiveQuestionProps): JSX.Element | null => {
  const { location, params } = getQuestionParameters(questionId);

  return (
    <InteractiveQuestionProvider
      location={location}
      params={params}
      componentPlugins={plugins}
      customTitle={customTitle}
      withResetButton={withResetButton}
      withTitle={withTitle}
    >
      <InteractiveQuestionResult height={height} />
    </InteractiveQuestionProvider>
  );
};

export const InteractiveQuestion =
  withPublicComponentWrapper(_InteractiveQuestion);

export const getQuestionParameters = (questionId: CardId) => {
  return {
    location: {
      query: {}, // TODO: add here wrapped parameterValues
      hash: "",
      pathname: `/question/${questionId}`,
    },
    params: {
      slug: questionId.toString(),
    },
  };
};
