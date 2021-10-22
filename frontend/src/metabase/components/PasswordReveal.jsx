/* flow */
import React, { Component } from "react";
import { t } from "ttag";

import CopyButton from "metabase/components/CopyButton";
import { color } from "metabase/lib/colors";

type State = {
  visible: boolean,
};

type Props = {
  password: string,
};

const styles = {
  input: {
    fontSize: "1.2rem",
    letterSpacing: "2",
    color: color("text-dark"),
    outline: "none",
  },
};

const Label = () => (
  <div style={{ top: -12 }} className="absolute text-centered left right">
    <span className="px1 bg-white h6 text-bold text-medium text-uppercase">
      {t`Temporary Password`}
    </span>
  </div>
);

export default class PasswordReveal extends Component {
  props: Props;
  state: State = { visible: false };

  render() {
    const { password } = this.props;
    const { visible } = this.state;

    return (
      <div
        style={{ borderWidth: 2 }}
        className="bordered rounded flex align-center p3 relative"
      >
        <Label />

        {visible ? (
          <input
            style={styles.input}
            className="text-light text-normal mr3 borderless"
            value={password}
            onClick={({ target }) =>
              target.setSelectionRange(0, target.value.length)
            }
          />
        ) : (
          <span style={styles.input} className="mr3">
            &#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;
          </span>
        )}

        <div className="ml-auto flex align-center">
          <a
            className="link text-bold mr2"
            onClick={() => this.setState({ visible: !visible })}
          >
            {visible ? t`Hide` : t`Show`}
          </a>

          <CopyButton
            className="text-brand-hover cursor-pointer"
            value={password}
          />
        </div>
      </div>
    );
  }
}
