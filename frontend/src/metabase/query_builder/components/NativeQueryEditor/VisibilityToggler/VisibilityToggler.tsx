import cx from "classnames";
import { t } from "ttag";

import { Flex, Icon, Text } from "metabase/ui";

import VisibilityTogglerS from "./VisibilityToggler.module.css";

interface VisibilityTogglerProps {
  isOpen: boolean;
  readOnly: boolean;
  toggleEditor: () => void;
  className?: string;
  isCollapsed?: boolean;
}

export const VisibilityToggler = ({
  isOpen,
  readOnly,
  toggleEditor,
  className = "",
  isCollapsed = false,
}: VisibilityTogglerProps) => {
  const text = isOpen && !isCollapsed ? null : t`Open Editor`;
  const icon = isCollapsed ? "expand" : isOpen ? "contract" : "expand";

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
