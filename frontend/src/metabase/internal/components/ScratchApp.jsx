import React from "react";
import ReactDOM from "react-dom";
import CheckBox from "metabase/components/CheckBox";
import cx from "classnames";

import AceEditor from "metabase/components/TextEditor";

import context from "../lib/scratch-context";

export default class ScratchApp extends React.Component {
  constructor(props) {
    super(props);
    const hash = window.location.hash.replace(/^#/, "");
    this.state = {
      code: hash ? atob(hash) : `<Button>Hello World</Button>`,
      error: null,
      centered: true,
    };
  }

  handleChange = code => {
    this.setState({ code });
    history.replaceState({}, null, "/_internal/scratch#" + btoa(code));
  };

  async _update() {
    try {
      const { code } = this.state;

      let fn;
      try {
        // if the module is an expression
        fn = new Function(
          "module",
          "context",
          `with(context) { \nreturn ${code}\n }`,
        );
      } catch (e) {
        fn = new Function(
          "module",
          "context",
          `with(context) { \n ${code}\n }`,
        );
      }
      // execute the function with module and context
      const mod = {};
      const result = fn(mod, context);
      // get an element/component from the return value or module.exports
      const elementOrComponent = mod.exports || result;
      // make sure it's an element
      const element = React.isValidElement(elementOrComponent)
        ? elementOrComponent
        : React.createElement(elementOrComponent);
      // render!
      ReactDOM.unstable_renderSubtreeIntoContainer(
        this,
        element,
        this._container,
      );
      this.setState({ error: null });
    } catch (e) {
      console.error(e);
      this.setState({ error: e });
    }
  }

  componentDidMount() {
    this._update();
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.code !== this.state.code) {
      this._update();
    }
  }

  render() {
    const { centered } = this.state;
    return (
      <div className="flex-full flex flex-column">
        <div
          ref={r => (this._container = r)}
          className={cx("flex-full relative", {
            "flex layout-centered": centered,
          })}
        />

        <AceEditor
          mode="ace/mode/jsx"
          theme="ace/theme/metabase"
          style={{
            height: 100,
            outline: this.state.error ? "2px solid red" : null,
          }}
          value={this.state.code}
          onChange={this.handleChange}
        />
        <div className="absolute bottom right flex align-center p1">
          <CheckBox
            label="Centered"
            checked={centered}
            onChange={e => this.setState({ centered: !centered })}
          />
        </div>
      </div>
    );
  }
}
