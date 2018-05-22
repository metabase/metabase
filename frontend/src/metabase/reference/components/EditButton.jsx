import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import pure from "recompose/pure";
import { t } from "c-3po";
import S from "./EditButton.css";

import Icon from "metabase/components/Icon.jsx";

const EditButton = ({ className, startEditing }) => (
  <button
    className={cx("Button", "Button--borderless", S.editButton, className)}
    type="button"
    onClick={startEditing}
  >
    <div className={S.editButtonBody}>
      <Icon name="pencil" size={16} />
      <span className="ml1">{t`Edit`}</span>
    </div>
  </button>
);

EditButton.propTypes = {
  className: PropTypes.string,
  startEditing: PropTypes.func.isRequired,
};

export default pure(EditButton);
