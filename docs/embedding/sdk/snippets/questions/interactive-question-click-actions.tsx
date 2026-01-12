import {
  defineMetabaseAuthConfig,
  InteractiveQuestion,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "http://localhost:3000",
});

const Example = () => {
  return (
    // [<snippet example>]
    <MetabaseProvider
      authConfig={authConfig}
      pluginsConfig={{
        mapQuestionClickActions: (clickActions, clicked) => {
          if (clicked?.column?.display_name === "Last Name") {
            // This adds a custom action to the menu when clicked on on "Last Name" column
            return [
              ...clickActions,
              {
                buttonType: "horizontal",
                name: "custom",
                title: "This is the Last Name column",
                onClick: () => alert("You clicked the Last Name column!"),
              },
            ];
          }

          if (clicked?.column?.display_name === "Plan") {
            // This performs an immediate action on "Plan" column instead of opening the menu
            return {
              onClick: () => alert("You clicked the Plan column!"),
            };
          }
          // default behavior (open Metabase's default click menu) on other columns
          return clickActions;
        },
      }}
    >
      <InteractiveQuestion questionId={1} />
    </MetabaseProvider>
  );
  // [<endsnippet example>]
};
