import React from "react";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

const SuggestionsSidebar = ({ suggestions }) => (
  <div className="flex flex-column full-height">
    <div className="py2 text-centered my3">
      <h3>More X-rays</h3>
    </div>
    <ol className="px2">
      {suggestions.map((s, i) => (
        <li className="bordered rounded bg-white shadowed mb2 p2 flex" key={i}>
          <div
            className="bg-slate-light rounded flex align-center justify-center text-slate mr1"
            style={{ width: 48, height: 48 }}
          >
            <Icon name="bolt" size={22} />
          </div>
          <div>
            <h3 className="m0 mb1">{s.name}</h3>
            <p className="text-paragraph mt0">{s.description}</p>
          </div>
        </li>
      ))}
    </ol>
    <div className="mt-auto border-top px2 py4">
      <div className="flex align-center justify-center ml-auto mr-auto text-brand-hover">
        <Icon name="refresh" className="mr1" />
        <span className="text-bold">See something else</span>
      </div>
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
            <div className="wrapper flex align-center">
              <Icon name="bolt" className="text-gold mr1" size={24} />
              <h2>
                Here are some things we thought were interesting in your Orders
                table.
              </h2>
              <Button className="ml-auto bg-green text-white" borderless>
                Save this
              </Button>
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
