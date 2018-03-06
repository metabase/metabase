import React from "react";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

const SuggestionsSidebar = ({ suggestions }) => (
  <div className="flex flex-column full-height">
    <div className="py2 text-centered mb2">
      <h3>More X-rays</h3>
    </div>
    <ol className="px2">
      {suggestions.map((s, i) => (
        <li className="bordered rounded bg-white shadowed mb2 p2 flex" key={i}>
          <div style={{ width: 48, height: 48 }}>
            <Icon name="bolt" />
          </div>
          <div>
            <h3 className="m0">{s.name}</h3>
            <p className="text-paragraph">{s.description}</p>
          </div>
        </li>
      ))}
    </ol>
    <div className="mt-auto border-top p2 text-align-center">
      See something else
    </div>
  </div>
);

SuggestionsSidebar.defaultProps = {
  suggestions: [
    { name: "Test", description: "test" },
    { name: "Test", description: "test" },
    { name: "Test", description: "test" },
    { name: "Test", description: "test" },
  ],
};

class OnboardDashApp extends React.Component {
  render() {
    return (
      <div className="flex full-height">
        <div className="flex flex-column" style={{ flex: 1 }}>
          <div className="bg-white border-bottom py2">
            <div className="wrapper">
              <h2>Test</h2>
              <Button green>Save</Button>
            </div>
          </div>
          <div className="bg-slate-extra-light flex align-center justify-center flex-full">
            <h4>Dash here</h4>
          </div>
        </div>
        <div className="bg-slate-light full-height" style={{ width: 300 }}>
          <SuggestionsSidebar />
        </div>
      </div>
    );
  }
}

export default OnboardDashApp;
