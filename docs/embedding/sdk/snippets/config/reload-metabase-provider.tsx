import { useEffect, useState } from "react";
import { InteractiveQuestion } from "@metabase/embedding-sdk-react";
import { isEqual } from "underscore";

const yourQuestionId = 1;

const Example = () => {
  // [<snippet example>]
  // Inside your application component
  const [data, setData] = useState({});
  // This is used to force reloading Metabase components
  const [counter, setCounter] = useState(0);

  // This ensures we only change the `data` reference when it's actually changed
  const handleDataChange = newData => {
    setData(prevData => {
      if (isEqual(prevData, newData)) {
        return prevData;
      }

      return newData;
    });
  };

  useEffect(() => {
    /**
     * When you set `data` as the `useEffect` hook's dependency, it will trigger the effect
     * and increment the counter which is used in a Metabase component's `key` prop, forcing it to reload.
     */
    if (data) {
      setCounter(counter => counter + 1);
    }
  }, [data]);

  return <InteractiveQuestion key={counter} questionId={yourQuestionId} />;
  // [<endsnippet example>]
};
