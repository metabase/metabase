import { PLUGIN_LLM_AUTODESCRIPTION } from "metabase/plugins";

import { useSaveQuestionContext } from "./context";

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
