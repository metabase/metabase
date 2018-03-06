import React from "react";

const SuggestionsSidebar = ({ suggestions }) => (
  <div>
    <ol>
      {suggestions.map(s => (
        <li className="bordered rounded">
          <h3>{s.name}</h3>
          <p>{s.description}</p>
        </li>
      ))}
    </ol>
  </div>
);

class OnboardDashApp extends React.Component {
  render() {
    return (
      <div>
        <h1>Test</h1>
        <SuggestionsSidebar />
      </div>
    );
  }
}

export default OnboardDashApp;
