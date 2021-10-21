import React from "react";
import PropTypes from "prop-types";
import { t, jt } from "ttag";
import OptionsMessage from "./OptionsMessage";

type Props = {
  fields: any[];
};

export default function NoMatchState({ fields }: Props) {
  if (fields.length > 1) {
    // if there is more than one field, don't name them
    return <OptionsMessage>{t`No matching result`}</OptionsMessage>;
  }
  const [{ display_name }] = fields;
  return (
    <OptionsMessage>{jt`No matching ${(
      <strong>&nbsp;{display_name}&nbsp;</strong>
    )} found.`}</OptionsMessage>
  );
}

NoMatchState.propTypes = {
  fields: PropTypes.arrayOf(PropTypes.object).isRequired,
};
