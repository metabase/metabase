import {
  CollectionBrowser,
  EditableDashboard,
  InteractiveQuestion,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";
import { observer } from "mobx-react-lite";
import { match } from "ts-pattern";

import { store } from "../store";

export const ReactSDK = observer(() => {
  const commonKey = `${store.forceStagedDataPicker ? "staged-" : "normal-"}${store.component}`;
  console.log("commonKey", commonKey);
  return (
    <MetabaseProvider authConfig={store.authConfig}>
      {/* <InteractiveQuestion
        questionId={186}
        //
        key={186}
        isSaveEnabled
      /> */}
      {match(store.component)
        .with("new-question", () => (
          <InteractiveQuestion
            questionId={"new"}
            // after you edit the question you'll be able to save it
            isSaveEnabled
            key={`${commonKey}-new-question`}
          />
        ))
        .with("question", () => (
          <InteractiveQuestion
            questionId={store.questionId}
            // after you edit the question you'll be able to save it
            isSaveEnabled
            key={`${commonKey}-${store.questionId}`}
          />
        ))
        .with("dashboard", () => (
          <EditableDashboard
            // you can add questions and you'll get a data picker
            // dataPickerProps={{ entityTypes: ["question", "table", "model"] }}
            dashboardId={store.dashboardId}
            key={`${commonKey}-${store.dashboardId}`}
          />
        ))
        .with("collection-browser", () => <CollectionBrowser />)
        .exhaustive()}
    </MetabaseProvider>
  );
});
