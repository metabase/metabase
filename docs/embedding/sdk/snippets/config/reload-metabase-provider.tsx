import { useState } from "react";
import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

const yourQuestionId = 1;
const order = {};

const api = {
  saveOrder: async (order: unknown) => {},
};

const Example = () => {
  // [<snippet example>]
  const [dataVersion, setDataVersion] = useState(0);

  const saveOrder = async (order) => {
    await api.saveOrder(order); // Your app changes its data...
    setDataVersion((v) => v + 1); // ...then changes the key, reloading the embed.
  };

  return (
    <>
      <button onClick={() => saveOrder(order)}>Save order</button>
      <InteractiveQuestion key={dataVersion} questionId={yourQuestionId} />
    </>
  );
  // [<endsnippet example>]
};
