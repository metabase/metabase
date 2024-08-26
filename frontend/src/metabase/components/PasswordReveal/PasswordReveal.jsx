/* eslint-disable react/prop-types */
/* flow */
import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";

import { PasswordCopyButton } from "./PasswordReveal.styled";

const styles = {
  input: {
    fontSize: "1.2rem",
    letterSpacing: "2",
    color: color("text-dark"),
    outline: "none",
  },
};

const Label = () => (
  <div
    style={{ top: -12 }}
    className={cx(CS.absolute, CS.textCentered, CS.left, CS.right)}
  >
    <span
      className={cx(
        CS.px1,
        CS.bgWhite,
        CS.h6,
        CS.textBold,
        CS.textMedium,
        CS.textUppercase,
      )}
    >
      {t`Temporary Password`}
    </span>
  </div>
);

export default class PasswordReveal extends Component {
  state = { visible: false };

  render() {
    const { password } = this.props;
    const { visible } = this.state;

    return (
      <div
        style={{ borderWidth: 2 }}
        className={cx(
          CS.bordered,
          CS.rounded,
          CS.flex,
          CS.alignCenter,
          CS.p3,
          CS.relative,
        )}
      >
        <Label />

        {visible ? (
          <input
            style={styles.input}
            className={cx(CS.textLight, CS.textNormal, CS.mr3, CS.borderless)}
            value={password}
            onClick={({ target }) =>
              target.setSelectionRange(0, target.value.length)
            }
          />
        ) : (
          <span style={styles.input} className={CS.mr3}>
            &#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;
          </span>
        )}

        <div className={cx(CS.mlAuto, CS.flex, CS.alignCenter)}>
          <a
            className={cx(CS.link, CS.textBold, CS.mr2)}
            onClick={() => this.setState({ visible: !visible })}
          >
            {visible ? t`Hide` : t`Show`}
          </a>

          <PasswordCopyButton value={password} />
        </div>
      </div>
    );
  }
}
