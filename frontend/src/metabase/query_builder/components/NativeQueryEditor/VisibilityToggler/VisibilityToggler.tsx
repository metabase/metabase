import { t } from "ttag";

import { Icon } from "metabase/ui";

import {
  ToggleContent,
  ToggleRoot,
  ToggleText,
} from "./VisibilityToggler.styled";

interface VisibilityTogglerProps {
  isOpen: boolean;
  readOnly: boolean;
  toggleEditor: () => void;
  className?: string;
}

export const VisibilityToggler = ({
  isOpen,
  readOnly,
  toggleEditor,
  className = "",
}: VisibilityTogglerProps) => {
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
