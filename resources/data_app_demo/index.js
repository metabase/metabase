"use strict";
// Demo data-app bundle.
//
// Conventions (matching what the host expects):
//   1. Plain JS — no import/export, no JSX. Safe for an LLM to emit without
//      a build step.
//   2. React + host components are provided by the host as endowments on
//      globalThis, so we never bundle them. We read them inside component
//      bodies because the endowments exist only inside the sandbox realm.
//   3. The bundle assigns a factory function to globalThis.__customVizPlugin__.
//      The host calls factory(hostApi) and renders the returned `component`
//      inside its own React tree, so we never touch ReactDOM.
//
// Host-injected globals available inside the sandbox:
//   - React                  the host's React instance
//   - InteractiveQuestion    Embedding SDK's drillable question, pre-wrapped
//                            with a session-backed SDK store (no authConfig
//                            needed — the host's session cookie handles auth).
(function () {
  function Counter() {
    var React = globalThis.React;
    var s = React.useState(0);
    var count = s[0];
    var setCount = s[1];

    return React.createElement(
      "div",
      {
        style: {
          padding: 16,
          border: "1px solid #ccc",
          borderRadius: 8,
          fontFamily: "system-ui, sans-serif",
          maxWidth: 360,
        },
      },
      React.createElement(
        "h3",
        { style: { marginTop: 0 } },
        "Plain React counter"
      ),
      React.createElement("p", null, "Count: ", count),
      React.createElement(
        "button",
        {
          onClick: function () {
            setCount(count + 1);
          },
          style: { padding: "4px 12px", cursor: "pointer" },
        },
        "Increment"
      )
    );
  }

  function QuestionEmbed(props) {
    var React = globalThis.React;
    var InteractiveQuestion = globalThis.InteractiveQuestion;
    return React.createElement(
      "div",
      { style: { height: 480 } },
      React.createElement(InteractiveQuestion, { questionId: props.questionId })
    );
  }

  function App(props) {
    var React = globalThis.React;
    return React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 16,
          fontFamily: "system-ui, sans-serif",
        },
      },
      React.createElement(Counter, null),
      React.createElement(QuestionEmbed, { questionId: props.questionId })
    );
  }

  globalThis.__customVizPlugin__ = function factory(_hostApi) {
    return { component: App };
  };
})();
