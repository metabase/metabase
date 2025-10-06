import cx from "classnames";
import { t } from "ttag";

import { Flex, Icon, Text } from "metabase/ui";

import VisibilityTogglerS from "./VisibilityToggler.module.css";

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
    <Flex
      component="a"
      align="center"
      className={cx(VisibilityTogglerS.ToggleContent, className, {
        [VisibilityTogglerS.isReadOnly]: readOnly,
      })}
      onClick={toggleEditor}
      data-testid="visibility-toggler"
      aria-hidden={readOnly}
    >
      {text && (
        <Text component="span" mr="sm" miw={70}>
          {text}
        </Text>
      )}
      <Icon name={icon} size={18} />
    </Flex>
  );
};
