import {
  InteractiveQuestion,
  type MetabaseAuthConfig,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

const authConfig = {} as MetabaseAuthConfig;

const Example = () => {
  // [<snippet example>]
  // You can provide a custom action with your own `onClick` logic.
  const createCustomAction = clicked => ({
    buttonType: "horizontal",
    name: "client-custom-action",
    section: "custom",
    type: "custom",
    icon: "chevronright",
    title: "Hello from the click app!!!",
    onClick: ({ closePopover }) => {
      alert(`Clicked ${clicked.column?.name}: ${clicked.value}`);
      closePopover();
    },
  });

  // Or customize the appearance of the custom action to suit your need.
  const createCustomActionWithView = clicked => ({
    name: "client-custom-action-2",
    section: "custom",
    type: "custom",
    view: ({ closePopover }) => (
      <button
        className="tw-text-base tw-text-yellow-900 tw-bg-slate-400 tw-rounded-lg"
        onClick={() => {
          alert(`Clicked ${clicked.column?.name}: ${clicked.value}`);
          closePopover();
        }}
      >
        Custom element
      </button>
    ),
  });

  const plugins = {
    /**
     * You will have access to default `clickActions` that Metabase renders by default.
     * So you could decide if you want to add custom actions, remove certain actions, etc.
     */
    mapQuestionClickActions: (clickActions, clicked) => {
      return [
        ...clickActions,
        createCustomAction(clicked),
        createCustomActionWithView(clicked),
      ];
    },
  };

  const questionId = 1; // This is the question ID you want to embed

  return (
    <MetabaseProvider authConfig={authConfig} pluginsConfig={plugins}>
      <InteractiveQuestion questionId={questionId} />
    </MetabaseProvider>
  );
  // [<endsnippet example>]
};
