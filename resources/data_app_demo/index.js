"use strict";
// Demo data-app bundle.
//
// Conventions (matching what the host expects):
//   1. Plain JS — no import/export, no JSX. Safe for an LLM to emit without
//      a build step.
//   2. React is provided by the host as an endowment on globalThis, so we
//      never bundle React. We read it inside component bodies because the
//      endowment exists only inside the sandbox realm.
//   3. The bundle assigns a factory function to globalThis.__customVizPlugin__.
//      The host calls factory(hostApi) and renders the returned `component`
//      inside its own React tree, so we never touch ReactDOM.
(function () {
  function Counter(props) {
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
        "Data app: Counter"
      ),
      React.createElement(
        "p",
        null,
        "Greeting: ",
        React.createElement("strong", null, props.greeting || "(none)")
      ),
      React.createElement("p", null, "Count: ", count),
      React.createElement(
        "button",
        {
          onClick: function () {
            setCount(count + 1);
          },
          style: {
            padding: "4px 12px",
            cursor: "pointer",
          },
        },
        "Increment"
      )
    );
  }

  globalThis.__customVizPlugin__ = function factory(_hostApi) {
    return { component: Counter };
  };
})();
