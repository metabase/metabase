import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import ModalContent from "metabase/components/ModalContent";
import CheckBox from "metabase/core/components/CheckBox";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";

import { CheckboxLabel } from "./DeleteModalWithConfirm.styled";

export default class DeleteModalWithConfirm extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      checked: {},
    };

    _.bindAll(this, "onDelete");
  }

  static propTypes = {
    title: PropTypes.string.isRequired,
    objectType: PropTypes.string.isRequired,
    confirmItems: PropTypes.array.isRequired,
    onClose: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
    buttonText: PropTypes.string,
  };

  async onDelete() {
    await this.props.onDelete();
    this.props.onClose();
  }

  render() {
    const { title, objectType, confirmItems, buttonText } = this.props;
    const { checked } = this.state;
    const confirmed = confirmItems.reduce(
      (acc, item, index) => acc && checked[index],
      true,
    );
    return (
      <ModalContent title={title} onClose={this.props.onClose}>
        <div>
          <ul>
            {confirmItems.map((item, index) => (
              <li
                key={index}
                className={cx(
                  CS.pb2,
                  CS.mb2,
                  CS.borderRowDivider,
                  CS.flex,
                  CS.alignCenter,
                )}
              >
                <CheckBox
                  label={<CheckboxLabel>{item}</CheckboxLabel>}
                  size={20}
                  checkedColor="danger"
                  uncheckedColor="danger"
                  checked={checked[index]}
                  onChange={e =>
                    this.setState({
                      checked: { ...checked, [index]: e.target.checked },
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </div>
        <div className={cx("Form-actions", CS.mlAuto)}>
          <button
            className={ButtonsS.Button}
            onClick={this.props.onClose}
          >{t`Cancel`}</button>
          <button
            className={cx(ButtonsS.Button, CS.ml2, {
              [ButtonsS.ButtonDanger]: confirmed,
              [CS.disabled]: !confirmed,
            })}
            onClick={this.onDelete}
          >
            {buttonText || t`Delete this ${objectType}`}
          </button>
        </div>
      </ModalContent>
    );
  }
}
