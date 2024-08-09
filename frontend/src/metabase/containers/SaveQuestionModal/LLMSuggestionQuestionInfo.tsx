import { useSaveQuestionContext } from "metabase/containers/SaveQuestionModal/context";
import { PLUGIN_LLM_AUTODESCRIPTION } from "metabase/plugins";

export const LLMSuggestionQuestionInfo = () => {
  const { initialValues, question, setValues, values } =
    useSaveQuestionContext();

  return (
    <PLUGIN_LLM_AUTODESCRIPTION.LLMSuggestQuestionInfo
      question={question}
      initialCollectionId={initialValues.collection_id}
      onAccept={nextValues => setValues({ ...values, ...nextValues })}
    />
  );
};
