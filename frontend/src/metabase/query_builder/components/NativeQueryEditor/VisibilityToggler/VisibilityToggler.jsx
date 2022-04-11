import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import { Container, Span } from "./VisibilityToggler.styled";

const propTypes = {
  isOpen: PropTypes.bool.isRequired,
  readOnly: PropTypes.bool.isRequired,
  toggleEditor: PropTypes.func.isRequired,
  className: PropTypes.string,
};

const VisibilityToggler = ({
  isOpen,
  readOnly,
  toggleEditor,
  className = "",
}) => {
  const text = isOpen ? null : t`Open Editor`;
  const icon = isOpen ? "contract" : "expand";

  const classNames = cx(
    className,
    "Query-label no-decoration flex align-center mx3 text-brand-hover transition-all",
    { hide: readOnly },
  );

  return (
    <Container>
      <a className={classNames} onClick={toggleEditor}>
        <Span>{text}</Span>
        <Icon name={icon} size={18} />
      </a>
    </Container>
  );
};

VisibilityToggler.propTypes = propTypes;

export default VisibilityToggler;
