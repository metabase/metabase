import React from "react";
import PropTypes from "prop-types";

import FormInputWidget from "./FormInputWidget";
import { t } from "ttag";
import PasswordStrengthBar from "react-password-strength-bar";

const scoreWordStyle = {
  textAlign: "left",
  fontWeight: "bolder",
  fontSize: "0.88em",
};

const FormPasswordStrengthWidget = props => {
  const { values } = props;

  return (
    <>
      <FormInputWidget {...props} type="password" />
      {values.password && (
        <PasswordStrengthBar
          scoreWordStyle={scoreWordStyle}
          password={values.password}
          shortScoreWord={t`Too short`}
          scoreWords={[t`Very weak`, t`Weak`, t`Okay`, t`Good`, t`Strong`]}
          barColors={["#93a1ab", "#ed6e6e", "#f9cf48", "#509ee3", "#84bb4c"]}
        />
      )}
    </>
  );
};

FormPasswordStrengthWidget.propTypes = {
  values: PropTypes.object,
};

export default FormPasswordStrengthWidget;
