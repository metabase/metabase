import PropTypes from "prop-types";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import {
  ToggleContent,
  ToggleRoot,
  ToggleText,
} from "./VisibilityToggler.styled";

const propTypes = {
  isOpen: PropTypes.bool.isRequired,
  readOnly: PropTypes.bool.isRequired,
  toggleEditor: PropTypes.func.isRequired,
  className: PropTypes.string,
};

export const VisibilityToggler = ({
  isOpen,
  readOnly,
  toggleEditor,
  className = "",
}) => {
  const text = isOpen ? null : t`Open Editor`;
  const icon = isOpen ? "contract" : "expand";

  return (
    <ToggleRoot>
      <ToggleContent
        className={className}
        isReadOnly={readOnly}
        onClick={toggleEditor}
        data-testid="visibility-toggler"
        aria-hidden={readOnly}
      >
        <ToggleText>{text}</ToggleText>
        <Icon name={icon} />
      </ToggleContent>
    </ToggleRoot>
  );
};

VisibilityToggler.propTypes = propTypes;
